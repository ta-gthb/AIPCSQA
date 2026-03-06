"""
customer_bot.py
AI customer simulation service — Flipkart e-commerce support scenarios.
Uses LLM to roleplay as a customer with a specific Flipkart support issue.
RAG-augmented: retrieves relevant Flipkart policies and injects them into the
system prompt so the simulated customer reflects realistic policy expectations.
"""
import random
from openai import AsyncOpenAI, RateLimitError, APIStatusError
from fastapi import HTTPException
from config import settings
from services.rag import retrieve_and_format

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)

# ── Flipkart-specific customer scenarios ────────────────────────────────────
SCENARIOS = [
    {
        "id": "flipkart_missing_delivery",
        "title": "Missing Delivery",
        "summary": (
            "You ordered a OnePlus 12 smartphone worth ₹59,999 on Flipkart 8 days ago. "
            "The tracking portal shows 'Delivered 3 days ago' but you never received "
            "the package. You checked with your building security and neighbours — nobody "
            "received it on your behalf. You want either a replacement or a full refund. "
            "You are quite upset and mention the item cost was significant."
        ),
        "rag_query": "missing delivery package not received tracking shows delivered",
    },
    {
        "id": "flipkart_wrong_item",
        "title": "Wrong Item Received",
        "summary": (
            "You ordered a Samsung 65-inch 4K QLED TV on Flipkart for ₹89,000 but "
            "received a completely different product — a 43-inch basic LED TV. "
            "You need the correct TV before next week as it is for a family function. "
            "You are disappointed and moderately frustrated. You want the correct TV "
            "delivered as a replacement urgently."
        ),
        "rag_query": "wrong item received replacement return incorrect product",
    },
    {
        "id": "flipkart_defective_product",
        "title": "Defective Product",
        "summary": (
            "You bought a Dyson V12 vacuum cleaner on Flipkart 5 days ago for ₹45,000. "
            "When you first switched it on today, it made a loud rattling noise and then "
            "stopped working completely. The device is clearly defective. "
            "You want a replacement or refund and are wondering if you need to go to a "
            "service centre. You are a Flipkart Plus member."
        ),
        "rag_query": "defective product not working replacement warranty return",
    },
    {
        "id": "flipkart_return_request",
        "title": "Return Request",
        "summary": (
            "You purchased a pair of Nike AIR MAX shoes on Flipkart 6 days ago for ₹12,499. "
            "The shoes do not fit — the size runs smaller than expected. "
            "You want to return them and get a refund. The shoes are unworn and "
            "in original packaging. You are calm but want to know the exact "
            "refund timeline and process."
        ),
        "rag_query": "return request shoes clothing size issue refund timeline",
    },
    {
        "id": "flipkart_payment_double_debit",
        "title": "Double Debit / Unauthorized Charge",
        "summary": (
            "You placed an order on Flipkart for a laptop worth ₹65,000 and your bank "
            "shows TWO debits of ₹65,000 each — but you only see ONE order on Flipkart. "
            "You are very concerned and want the duplicate amount refunded immediately. "
            "You are worried it might be fraud. You are agitated."
        ),
        "rag_query": "double debit unauthorized charge duplicate payment refund",
    },
    {
        "id": "flipkart_cancellation",
        "title": "Cancel Order",
        "summary": (
            "You placed a Flipkart prepaid order for home furniture (a sofa set, ₹38,000) "
            "yesterday but changed your mind today. The order status shows 'Confirmed' "
            "and it hasn't shipped yet. You want to cancel and get a full refund. "
            "You want to know how long the refund will take. You are calm."
        ),
        "rag_query": "cancel order before shipment refund timeline prepaid",
    },
    {
        "id": "flipkart_delayed_delivery",
        "title": "Delayed Delivery",
        "summary": (
            "You ordered a birthday gift (a Fossil watch, ₹8,500) on Flipkart "
            "with a promised delivery date of yesterday. It still hasn't arrived and tracking "
            "hasn't updated in 2 days. The birthday is tomorrow. "
            "You are stressed and want to know if it will arrive or if you should cancel."
        ),
        "rag_query": "delayed delivery estimated date passed refund cancel",
    },
    {
        "id": "flipkart_account_locked",
        "title": "Account Locked",
        "summary": (
            "You have been locked out of your Flipkart account for 3 hours. "
            "You tried to reset your password but the OTP is not arriving on your "
            "registered mobile number. You have a Flipkart Big Billion Day sale deal "
            "expiring in 2 hours that you need to place. "
            "You are very stressed and need this resolved urgently."
        ),
        "rag_query": "account locked password reset OTP not received login",
    },
    {
        "id": "flipkart_emi_refund",
        "title": "EMI Cancellation and Refund",
        "summary": (
            "You bought a MacBook Air M3 on Flipkart for ₹1,14,900 on 12-month zero-cost EMI "
            "via your HDFC credit card. You received it yesterday but it has a screen defect "
            "and you want to return it. You are confused about how the EMI refund works — "
            "will all installments be cancelled? You want a clear explanation before deciding."
        ),
        "rag_query": "EMI cancellation return refund credit card installments zero cost",
    },
    {
        "id": "flipkart_tampered_package",
        "title": "Tampered / Opened Package",
        "summary": (
            "A Flipkart delivery arrived today. When the delivery person handed it over, "
            "you noticed the outer box was clearly torn and the seal was broken. "
            "You accepted the package but on opening, the iPad inside has scratches and "
            "is missing the charging cable. "
            "You want to return this and get a replacement. You are upset."
        ),
        "rag_query": "tampered package opened damaged delivery missing accessories return",
    },
]

_SYSTEM_TEMPLATE = """You are roleplaying as a customer contacting Flipkart customer support.

Your situation: {scenario}

{policy_context}

Rules you MUST follow:
- You are a real human customer. Be natural, emotional, and realistic.
- Keep every reply SHORT — 1 to 3 sentences only. Never write paragraphs.
- Do NOT say you are an AI. Stay in character completely.
- Do NOT resolve your own issue — wait for the agent to fix it.
- If the agent gives WRONG policy information (contradicts the Flipkart policies above),
  you may gently question it (e.g., "But I thought Flipkart's return window is 10 days?").
- If the agent gives vague or unhelpful answers, push back or ask for clarification.
- If the agent resolves your issue professionally and correctly per policy, express relief/satisfaction.
- Do not invent new problems unless naturally prompted.
- Refer to Flipkart (not generic "the company") since you shopped on Flipkart.
""".strip()


async def get_opening_message(scenario: dict) -> str:
    """Generate the customer's first message, augmented with relevant Flipkart policy."""
    rag_query   = scenario.get("rag_query", scenario["summary"][:120])
    policy_ctx  = await retrieve_and_format(rag_query, top_k=3, header="RELEVANT FLIPKART POLICIES (for your awareness)")
    system      = _SYSTEM_TEMPLATE.format(
        scenario=scenario["summary"],
        policy_context=policy_ctx,
    )
    try:
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=100,
            temperature=0.85,
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": (
                        "The Flipkart support agent just answered: "
                        "'Thank you for calling Flipkart Customer Support, how can I assist you today?' "
                        "Respond as the customer — state your issue clearly in 1-2 sentences."
                    ),
                },
            ],
        )
        return resp.choices[0].message.content.strip()
    except RateLimitError as e:
        raise HTTPException(
            status_code=402,
            detail="OpenAI quota exceeded. Please add credits to your OpenAI account at platform.openai.com/settings/billing.",
        ) from e
    except APIStatusError as e:
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {e.message}") from e


async def get_customer_reply(scenario: dict, history: list[dict]) -> str:
    """
    Generate the customer's next reply, augmented with relevant Flipkart policy.
    history = [{role: 'agent'|'customer', text: '...'}]
    The last item in history should be the agent's most recent turn.
    """
    # Build a short query from the last 2 turns for targeted retrieval
    recent_text = " ".join(t["text"] for t in history[-2:])
    rag_query   = scenario.get("rag_query", "") + " " + recent_text
    policy_ctx  = await retrieve_and_format(rag_query[:400], top_k=3, header="RELEVANT FLIPKART POLICIES (for your awareness)")

    system   = _SYSTEM_TEMPLATE.format(
        scenario=scenario["summary"],
        policy_context=policy_ctx,
    )
    messages = [{"role": "system", "content": system}]
    for turn in history:
        role = "user" if turn["role"] == "agent" else "assistant"
        messages.append({"role": role, "content": turn["text"]})

    try:
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=100,
            temperature=0.85,
            messages=messages,
        )
        return resp.choices[0].message.content.strip()
    except RateLimitError as e:
        raise HTTPException(
            status_code=402,
            detail="OpenAI quota exceeded. Please add credits to your OpenAI account at platform.openai.com/settings/billing.",
        ) from e
    except APIStatusError as e:
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {e.message}") from e


def random_scenario() -> dict:
    return random.choice(SCENARIOS)
