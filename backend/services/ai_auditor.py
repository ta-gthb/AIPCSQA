import json

from openai import AsyncOpenAI
from config import settings
from services.rag import retrieve_and_format

# Remove any unsupported 'proxies' argument from AsyncOpenAI initialization
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)

_AUDIT_SYSTEM_BASE = """
You are AIPCSQA, an expert customer support quality auditor specialising in
Flipkart e-commerce customer support.
Analyse the provided call transcript and return ONLY a valid JSON object
with this exact schema (no markdown, no extra text):

{{
  "overall_score": <0-100 float>,
  "dimensions": {{
    "empathy":          <0-10 float>,
    "compliance":       <0-10 float>,
    "resolution":       <0-10 float>,
    "professionalism":  <0-10 float>,
    "communication":    <0-10 float>
  }},
  "sentiment": "positive" | "neutral" | "negative",
  "violations": [
    {{
      "type": "<violation category>",
      "severity": "Critical" | "High" | "Medium" | "Low",
      "turn_index": <int>,
      "description": "<what happened and why it's a violation>"
    }}
  ],
  "suggestions": [
    {{
      "turn_index": <int>,
      "original": "<agent's exact words>",
      "suggestion": "<improved phrasing or action>",
      "reason": "<why this is better per Flipkart policy>"
    }}
  ],
  "summary": "<2-3 sentence qualitative summary>"
}}

SCORING RULES — apply these strictly:
- If the agent has only 1 turn: overall_score must be 10-25. empathy, resolution,
  communication all ≤ 2.0. This shows bare-minimum effort.
- If the agent has 2-3 turns: overall_score must be 15-40. Scores reflect minimal engagement.
- A score above 70 requires the agent to have meaningfully addressed the customer's issue,
  offered a concrete resolution, and followed policy correctly.
- Never award a score above 50 unless the agent clearly resolved or progressed toward
  resolution of the customer's stated problem.
- Score the AGENT ONLY on what they actually said — absence of a response is a critical failure.

Violation categories to detect:
- No Agent Response (agent did not speak at all)
- Unauthorized Commitment (promising outcomes not guaranteed by Flipkart policy)
- Wrong Policy Information (agent stated incorrect refund timeline, return window, etc.)
- Mandatory Disclaimer Skipped (didn't state refund timeline, ticket ref, warranty info)
- Empathy Gap (policy requires empathy acknowledgment)
- Escalation Protocol Missed
- Sensitive Data on Open Line (reading card numbers, Aadhaar on call)
- Data Privacy Breach (sharing customer info without OTP verification)
- Profanity / Inappropriate Language

{policy_context}
""".strip()

async def audit_transcript(turns: list[dict]) -> dict:
    """
    turns = [{role: 'agent'|'customer', text: '...', ts_start: 0.0}, ...]
    Returns parsed JSON dict from the LLM, augmented with Flipkart policy context.
    """
    formatted = "\n".join(
        f"[{i}] {t['role'].upper()}: {t['text']}"
        for i, t in enumerate(turns)
    )

    # Build RAG query from the full transcript text
    transcript_text = " ".join(t["text"] for t in turns[:12])  # first 12 turns
    policy_ctx = await retrieve_and_format(
        query=transcript_text[:500],
        top_k=4,
        header="FLIPKART POLICY REFERENCE (use this to detect wrong information and violations)",
    )

    system_prompt = _AUDIT_SYSTEM_BASE.format(policy_context=policy_ctx)

    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=2048,
        temperature=0.2,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": f"Transcript:\n\n{formatted}\n\nRespond with valid JSON only."},
        ]
    )

    raw = response.choices[0].message.content.strip()
    return json.loads(raw)


async def whisper_suggestion(turns: list[dict], current_turn: dict) -> str:
    """
    Real-time coaching: given conversation so far + agent's current utterance,
    return a short whisper-coaching message for the supervisor.
    """
    context = "\n".join(
        f"[{t['role'].upper()}]: {t['text']}" for t in turns[-6:]
    )
    # Retrieve relevant Flipkart policy for this moment in the conversation
    whisper_query = current_turn["text"] + " " + context[-200:]
    policy_ctx = await retrieve_and_format(
        query=whisper_query[:400],
        top_k=2,
        header="RELEVANT FLIPKART POLICY",
    )

    prompt = (
        f"{policy_ctx}\n\n"
        f"Recent conversation:\n{context}\n\n"
        f'Agent just said: "{current_turn["text"]}"\n\n'
        "In ≤2 sentences, suggest how the agent could improve this response RIGHT NOW "
        "based on Flipkart policy. Be direct and actionable. "
        "If the response is correct per policy, say 'Looks good — keep it up!'"
    )
    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=150,
        temperature=0.3,
        messages=[
            {"role": "system", "content": "You are a real-time Flipkart call coaching assistant. Be concise and direct."},
            {"role": "user",   "content": prompt},
        ]
    )
    return response.choices[0].message.content.strip()


async def enrich_turns_with_expressions(turns: list[dict]) -> list[dict]:
	"""
	Enrich agent turns with emotion/expression analysis.
	For each agent turn, detects: tone (positive, neutral, negative), professionalism (high, medium, low), engagement (high, medium, low).
	Preserves all existing turn fields (role, text, ts_start, ts_end).
	"""
	enriched = []
	agent_turns = [(i, t) for i, t in enumerate(turns) if t.get("role") == "agent"]
	
	if not agent_turns:
		return turns
	
	# Batch analyze agent turns
	analysis_results = {}
	for idx, turn in agent_turns:
		text = turn.get("text", "").strip()
		if not text:
			analysis_results[idx] = {
				"tone": "neutral",
				"professionalism": "medium",
				"engagement": "low",
				"expression": "neutral"
			}
			continue
		
		prompt = f"""Analyze this agent response from a customer support call. Return ONLY valid JSON:
{{
  "tone": "positive" | "neutral" | "negative",
  "professionalism": "high" | "medium" | "low",
  "engagement": "high" | "medium" | "low",
  "expression": "<one word emotion: helpful, empathetic, patient, frustrated, confused, professional, enthusiastic, passive>"
}}

Agent response: "{text}"

Respond with ONLY the JSON object, no markdown or extra text."""
		
		try:
			response = await client.chat.completions.create(
				model="llama-3.3-70b-versatile",
				max_tokens=100,
				temperature=0.2,
				messages=[
					{"role": "system", "content": "You are an emotion and tone analyzer for customer support calls. Respond with only valid JSON."},
					{"role": "user", "content": prompt},
				]
			)
			raw = response.choices[0].message.content.strip()
			result = json.loads(raw)
			analysis_results[idx] = result
		except Exception as e:
			print(f"Error analyzing turn {idx}: {e}")
			analysis_results[idx] = {
				"tone": "neutral",
				"professionalism": "medium",
				"engagement": "medium",
				"expression": "neutral"
			}
	
	# Merge analysis into turns
	for i, turn in enumerate(turns):
		enriched_turn = turn.copy()
		if i in analysis_results:
			enriched_turn["expression"] = analysis_results[i]
		enriched.append(enriched_turn)
	
	return enriched


async def generate_quick_responses(customer_message: str, conversation_context: list[dict] = None) -> list[str]:
	"""
	Generate 3-4 contextual quick response suggestions for the agent based on customer message.
	Uses the latest customer message and conversation context to produce relevant replies.
	"""
	if not customer_message or not customer_message.strip():
		return []
	
	# Build context from recent conversation
	context_text = ""
	if conversation_context:
		recent_turns = conversation_context[-6:]  # last 3 agent-customer exchanges
		for turn in recent_turns:
			role = turn.get("role", "unknown").upper()
			text = turn.get("text", "")
			context_text += f"\n[{role}]: {text}"
	
	prompt = f"""You are a helpful Flipkart customer support assistant. Based on the customer's message and conversation context, generate 3-4 SHORT, professional quick response suggestions that the agent can use immediately.

These should be:
- Concise (1-2 sentences each)
- Professional and empathetic
- Actionable replies that move the conversation forward
- Compliant with Flipkart support policy

CONVERSATION CONTEXT:{context_text}

CUSTOMER'S LATEST MESSAGE: "{customer_message}"

Return ONLY a JSON array of strings (the quick responses), nothing else. Example:
["I understand your concern. Let me help you with that.", "Thank you for reporting this. I'll investigate immediately.", "I found a solution..."]
"""
	
	try:
		response = await client.chat.completions.create(
			model="llama-3.3-70b-versatile",
			max_tokens=500,
			temperature=0.7,
			messages=[
				{
					"role": "system", 
					"content": "You are a customer support response suggestion engine. Generate helpful, professional quick responses. Return only valid JSON array."
				},
				{
					"role": "user",
					"content": prompt
				}
			]
		)
		raw = response.choices[0].message.content.strip()
		# Clean up markdown wrapping if present
		if raw.startswith("```"):
			raw = raw.split("```")[1]
			if raw.startswith("json"):
				raw = raw[4:]
		suggestions = json.loads(raw)
		# Ensure we return only strings
		return [str(s).strip() for s in suggestions if s][:4]  # max 4 suggestions
	except Exception as e:
		print(f"Error generating quick responses: {e}")
		return []
