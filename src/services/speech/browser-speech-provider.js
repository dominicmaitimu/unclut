export class BrowserSpeechProvider {
  get isSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  }

  start({ onTranscript, onEnd, onError }) {
    if (!this.isSupported) {
      onError('Spraakherkenning is niet beschikbaar in deze browser.')
      return
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    this.recognition = new Recognition()
    this.recognition.lang = 'nl-NL'
    this.recognition.interimResults = true
    this.recognition.continuous = false

    let finalTranscript = ''
    this.recognition.onresult = (event) => {
      let interimTranscript = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript
        if (event.results[index].isFinal) finalTranscript += transcript
        else interimTranscript += transcript
      }
      onTranscript(`${finalTranscript}${interimTranscript}`)
    }
    this.recognition.onerror = (event) => onError(errorMessage(event.error))
    this.recognition.onend = () => onEnd()
    this.recognition.start()
  }

  stop() {
    this.recognition?.stop()
  }
}

function errorMessage(error) {
  if (error === 'not-allowed') return 'Microfoontoegang is niet toegestaan.'
  if (error === 'no-speech') return 'Ik hoorde geen spraak. Probeer het opnieuw.'
  return 'De spraakopname kon niet worden voltooid.'
}