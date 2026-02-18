import whisper
import speech_recognition as sr
from gtts import gTTS
import os

# Load Whisper model
model = whisper.load_model("base")

def listen_and_transcribe():
	r = sr.Recognizer()
	with sr.Microphone() as source:
		print("Say something...")
		audio = r.listen(source)
		with open("input.wav", "wb") as f:
			f.write(audio.get_wav_data())
	result = model.transcribe("input.wav")
	return result["text"]

def generate_response(text):
	return f"You said: {text}"

def speak(text):
	tts = gTTS(text=text, lang='en')
	tts.save("response.mp3")
	os.system("start response.mp3")

def main():
	while True:
		user_input = listen_and_transcribe()
		print(f"You: {user_input}")
		response = generate_response(user_input)
		print(f"Bot: {response}")
		speak(response)
		again = input("Continue? (y/n): ")
		if again.lower() != 'y':
			break

if __name__ == "__main__":
	main()
