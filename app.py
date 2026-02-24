
import whisper
import datetime
import speech_recognition as sr
from googletrans import Translator


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

def transcribe_audio_file(filepath):
	result = model.transcribe(filepath)
	return result["text"]

def generate_response(text):
	return f"You said: {text}"

def speak(text):
	# Audio response disabled. Transcription is now saved to text file.
	pass

def select_language():
	languages = {
		'1': ('English', 'en'),
		'2': ('Hindi', 'hi'),
	}
	print("Select output language:")
	for key, (name, code) in languages.items():
		print(f"{key}: {name}")
	choice = input("Enter the number for your language (default 1 for English): ")
	if choice not in languages:
		choice = '1'
	return languages[choice][1], languages[choice][0]

def main():
	mode = input("Do you want to (1) record audio or (2) transcribe an existing audio file? Enter 1 or 2: ")
	lang_code, lang_name = select_language()
	translator = Translator()
	timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
	transcript_filename = f"transcription_{timestamp}.txt"
	if mode.strip() == '2':
		filepath = input("Enter the path to your audio file (wav/mp3): ").strip()
		user_input = transcribe_audio_file(filepath)
		if lang_code != 'en':
			translated = translator.translate(user_input, dest=lang_code)
			print(f"Transcript in {lang_name}: {translated.text}")
			with open(transcript_filename, "a", encoding="utf-8") as f:
				f.write(f"Transcript in {lang_name}: {translated.text}\n")
		else:
			print(f"Transcript in English: {user_input}")
			with open(transcript_filename, "a", encoding="utf-8") as f:
				f.write(f"Transcript in English: {user_input}\n")
	else:
		mic_index = select_microphone()
		while True:
			user_input = listen_and_transcribe(mic_index)
			if lang_code != 'en':
				translated = translator.translate(user_input, dest=lang_code)
				print(f"Transcript in {lang_name}: {translated.text}")
				with open(transcript_filename, "a", encoding="utf-8") as f:
					f.write(f"Transcript in {lang_name}: {translated.text}\n")
			else:
				print(f"Transcript in English: {user_input}")
				with open(transcript_filename, "a", encoding="utf-8") as f:
					f.write(f"Transcript in English: {user_input}\n")
			again = input("Continue? (y/n): ")
			if again.lower() != 'y':
				break

if __name__ == "__main__":
	main()