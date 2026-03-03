import json

from openai import AsyncOpenAI
from config import settings

# Remove any unsupported 'proxies' argument from AsyncOpenAI initialization
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)

SYSTEM_PROMPT = """
You are AIPCSQA, an expert customer support quality auditor.
Analyse the provided call transcript and return ONLY a valid JSON object
with this exact schema (no markdown, no extra text):

{
  "overall_score": <0-100 float>,
  "dimensions": {
    "empathy":          <0-10 float>,
    "compliance":       <0-10 float>,
    "resolution":       <0-10 float>,
    "professionalism":  <0-10 float>,
    "communication":    <0-10 float>
  },
  "sentiment": "positive" | "neutral" | "negative",
  "violations": [
    {
      "type": "<violation category>",
      "severity": "Critical" | "High" | "Medium" | "Low",
      "turn_index": <int>,
      "description": "<what happened and why it's a violation>"
    }
  ],
  "suggestions": [
    {
      "turn_index": <int>,
      "original": "<agent's exact words>",
      "suggestion": "<improved phrasing or action>",
      "reason": "<why this is better>"
    }
  ],
  "summary": "<2-3 sentence qualitative summary>"
}

Violation categories to detect:
- Unauthorized Commitment (promising outcomes you can't guarantee)
- Mandatory Disclaimer Skipped
- Empathy Gap (policy requires empathy acknowledgment)
- Escalation Protocol Missed
- Sensitive Data on Open Line
- GDPR / Data Handling Breach
- Profanity / Inappropriate Language
""".strip()

async def audit_transcript(turns: list[dict]) -> dict:
    """
    turns = [{role: 'agent'|'customer', text: '...', ts_start: 0.0}, ...]
    Returns parsed JSON dict from GPT-4o.
    """
    formatted = "\n".join(
        f"[{i}] {t['role'].upper()}: {t['text']}"
        for i, t in enumerate(turns)
    )

    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=2048,
        temperature=0.2,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
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
    prompt = (
        f"Recent conversation:\n{context}\n\n"
        f"Agent just said: \"{current_turn['text']}\"\n\n"
        "In ≤2 sentences, suggest how the agent could improve this response RIGHT NOW. "
        "Be direct and actionable. If the response is fine, say 'Looks good — keep it up!'"
    )
    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=150,
        temperature=0.3,
        messages=[
            {"role": "system", "content": "You are a real-time call coaching assistant. Be concise and direct."},
            {"role": "user",   "content": prompt},
        ]
    )
    return response.choices[0].message.content.strip()
