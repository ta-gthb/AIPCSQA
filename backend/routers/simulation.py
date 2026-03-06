"""
simulation.py
Real-time AI customer simulation for voice call and live chat.
Provides two endpoints:
  POST /simulation/start  – spin up a scenario, return call_ref + AI opening line
  POST /simulation/turn   – agent sends a message, get AI customer reply
"""
import io
import random
import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from routers.auth import current_user
from models.user import User
from services.customer_bot import (
    get_opening_message,
    get_customer_reply,
    random_scenario,
    SCENARIOS,
)

router = APIRouter(prefix="/simulation", tags=["simulation"])


# ── Request / response schemas ────────────────────────────────────

class TurnIn(BaseModel):
    role: str   # "agent" | "customer"
    text: str


class TurnRequest(BaseModel):
    scenario_id: str
    agent_text:  str
    history:     list[TurnIn]   # full conversation so far (including current agent turn)


# ── Endpoints ─────────────────────────────────────────────────────

@router.post("/start")
async def start_simulation(
    channel: str = "phone",
    _: User = Depends(current_user),
):
    """
    Start a new simulated call or chat session.
    Returns: call_ref, scenario object, and the AI customer's opening message.
    """
    scenario = random_scenario()
    opening  = await get_opening_message(scenario)
    ts       = datetime.datetime.utcnow().strftime("%m%d%H%M%S")
    call_ref = f"SIM-{channel[:1].upper()}{ts}-{random.randint(100, 999)}"
    return {
        "call_ref":        call_ref,
        "scenario":        scenario,
        "opening_message": opening,
    }


@router.post("/turn")
async def simulation_turn(
    body: TurnRequest,
    _: User = Depends(current_user),
):
    """
    Given the full conversation history (ending with the agent's latest turn),
    return the AI customer's next reply.
    """
    scenario_obj = next(
        (s for s in SCENARIOS if s["id"] == body.scenario_id),
        SCENARIOS[0],
    )
    history = [t.dict() for t in body.history]
    reply   = await get_customer_reply(scenario_obj, history)
    return {"customer_text": reply}


@router.get("/tts")
async def text_to_speech(
    text: str = Query(..., max_length=500),
    _: User = Depends(current_user),
):
    """
    Convert text to speech (MP3) so the browser can play customer voice
    through the Web Audio API and capture it in the mixed recording.
    """
    from gtts import gTTS
    buf = io.BytesIO()
    gTTS(text=text, lang="en", slow=False).write_to_fp(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )
