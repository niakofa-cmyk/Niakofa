type SpeechRecognitionLike = SpeechRecognition;

interface Window {
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
  webkitAudioContext?: typeof AudioContext;
}