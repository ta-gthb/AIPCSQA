"""
customer_bot.py
AI customer simulation service.
Uses GPT-4o-mini to roleplay as a customer with a specific support issue.
"""
import random
from openai import AsyncOpenAI, RateLimitError, APIStatusError
from fastapi import HTTPException
from config import settings

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)

# Predefined customer scenarios
SCENARIOS = [
    {
        "id": "billing_dispute",
        "title": "Billing Dispute",
        "summary": (
            "You saw an unexpected $49.99 charge labelled 'Premium Renewal' "
            "on your account dated 3 days ago. You never authorised this upgrade "
            "and want a full reversal. You are moderately frustrated."
        ),
    },
    {
        "id": "missing_delivery",
        "title": "Missing Delivery",
        "summary": (
            "You ordered a laptop 10 days ago. Tracking says it was delivered "
            "3 days ago but you never received it. You checked with neighbours "
            "and building reception — nothing. You want a replacement or refund. "
            "You are quite upset."
        ),
    },
    {
        "id": "account_locked",
        "title": "Account Locked",
        "summary": (
            "You have been locked out of your account for 2+ hours. Password reset "
            "emails are not arriving. You need access urgently for a client project "
            "due today. You are stressed and need this fixed fast."
        ),
    },
    {
        "id": "defective_product",
        "title": "Defective Product",
        "summary": (
            "You received a smartwatch that refuses to power on despite charging "
            "for 4 hours. The item arrived in damaged packaging. You want either "
            "an immediate replacement or a complete refund. You are disappointed."
        ),
    },
    {
        "id": "subscription_cancel",
        "title": "Cancel Subscription",
        "summary": (
            "You want to cancel your premium subscription that auto-renewed "
            "yesterday. You forgot to cancel before the renewal and want a prorated "
            "refund for the remaining 29 days. You are calm but firm."
        ),
    },
    {
        "id": "wrong_item",
        "title": "Wrong Item Received",
        "summary": (
            "You ordered a blue jacket in size L but received a red one in size S. "
            "You need the correct item before the weekend as it's a gift. "
            "You are disappointed and expecting a fast resolution."
        ),
    },
]

_SYSTEM_TEMPLATE = """You are roleplaying as a customer calling a customer support center.

Your situation: {scenario}

Rules you MUST follow:
- You are a real human. Be natural, emotional, and realistic.
- Keep every reply SHORT — 1 to 3 sentences only. Never write paragraphs.
- Do NOT say you are an AI. Stay in character completely.
- Do NOT resolve your own issue — wait for the agent to fix it.
- If the agent gives vague or unhelpful answers, push back or ask for clarification.
- If the agent resolves your issue fully and professionally, express relief/satisfaction.
- Do not invent new problems unless naturally prompted.
""".strip()


async def get_opening_message(scenario: dict) -> str:
    """Generate the customer's first message after agent answers the call."""
    system = _SYSTEM_TEMPLATE.format(scenario=scenario["summary"])
    try:
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=80,
            temperature=0.85,
            messages=[
                {"role": "system",  "content": system},
                {
                    "role": "user",
                    "content": (
                        "The agent just answered: 'Thank you for calling, how can I assist you today?' "
                        "Respond as the customer — state your issue clearly."
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
    Generate the customer's next reply.
    history = [{role: 'agent'|'customer', text: '...'}]
    The last item in history should be the agent's most recent turn.
    """
    system = _SYSTEM_TEMPLATE.format(scenario=scenario["summary"])
    messages = [{"role": "system", "content": system}]
    for turn in history:
        # From GPT's perspective: customer is 'assistant', agent is 'user'
        role = "user" if turn["role"] == "agent" else "assistant"
        messages.append({"role": role, "content": turn["text"]})
    try:
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=80,
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
