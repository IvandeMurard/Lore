import asyncio
import os
from dotenv import load_dotenv
from speechmatics.rt import (
    AsyncClient,
    ServerMessageType,
    TranscriptionConfig,
    TranscriptResult,
    AudioFormat,
    AudioEncoding,
    Microphone,
)

load_dotenv()

DEVICE_INDEX = 1          # your Realtek
SAMPLE_RATE = 44100       # Realtek defaultSR in your list
CHUNK_SIZE = 4096

async def main():
    client = AsyncClient(api_key=os.getenv("SPEECHMATICS_API_KEY"))

    # IMPORTANT: keyword args
    mic = Microphone(sample_rate=SAMPLE_RATE, channels=1, chunk_size=CHUNK_SIZE, device_index=DEVICE_INDEX)

    @client.on(ServerMessageType.ADD_TRANSCRIPT)
    def on_final(message):
        result = TranscriptResult.from_message(message)
        txt = (result.metadata.transcript or "").strip()
        if txt:
            print(f"\n[final]: {txt}")

    @client.on(ServerMessageType.ADD_PARTIAL_TRANSCRIPT)
    def on_partial(message):
        result = TranscriptResult.from_message(message)
        txt = (result.metadata.transcript or "").strip()
        if txt:
            print(f"\r[partial]: {txt}", end="", flush=True)

    if not mic.start():
        print("❌ Could not start microphone")
        return

    try:
        await client.start_session(
            transcription_config=TranscriptionConfig(
                language="en",
                enable_partials=True,
                # optional: operating_point="enhanced" depending on SDK version
            ),
            audio_format=AudioFormat(
                encoding=AudioEncoding.PCM_S16LE,
                sample_rate=SAMPLE_RATE,   # MUST match mic open rate
            ),
        )
        print("Speak now... (Ctrl+C to stop)")

        while True:
            audio = await mic.read(CHUNK_SIZE)
            if audio:
                await client.send_audio(audio)

    finally:
        mic.stop()
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
