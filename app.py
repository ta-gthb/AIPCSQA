import whisper
import speech_recognition as sr
from gtts import gTTS
import os

def select_microphone():
	mics = sr.Microphone.list_microphone_names()
	print("Available microphones:")
	for i, mic in enumerate(mics):
		print(f"{i}: {mic}")
	idx = input("Select microphone index (default 0): ")
	try:
		idx = int(idx)
	except ValueError:
		idx = 0
	return idx

# Load Whisper model
model = whisper.load_model("base")

def listen_and_transcribe(mic_index):
	r = sr.Recognizer()
	with sr.Microphone(device_index=mic_index) as source:
		print("Say something...")
		r.adjust_for_ambient_noise(source, duration=1)
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
	mic_index = select_microphone()
	while True:
		user_input = listen_and_transcribe(mic_index)
		print(f"You: {user_input}")
		response = generate_response(user_input)
		print(f"Bot: {response}")
		speak(response)
		again = input("Continue? (y/n): ")
		if again.lower() != 'y':
			break

if __name__ == "__main__":
	main()