
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { decodeAudioData, arrayBufferToBase64 } from '../services/audioUtils';
import { summarizeConversation } from '../services/geminiService';

interface TranscriptItem {
  role: 'user' | 'model';
  text: string;
}

export const VoiceInterface: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error' | 'summarizing'>('disconnected');
  const [volume, setVolume] = useState(0); // For visualization
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);

  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<Promise<any> | null>(null);
  
  // UI Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const transcriptHistoryRef = useRef<TranscriptItem[]>([]); 
  
  // Refs for accumulation to prevent stale closures
  const currentInputRef = useRef('');
  const currentOutputRef = useRef('');

  // Auto-scroll to bottom of transcript
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, currentInput, currentOutput]);

  const disconnect = async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    
    setIsConnected(false);
    setVolume(0);
    setStatus('disconnected');
    setCurrentInput('');
    setCurrentOutput('');
    currentInputRef.current = '';
    currentOutputRef.current = '';
  };

  const handleCreateSticky = async () => {
    if (transcriptHistoryRef.current.length === 0) return;
    
    setStatus('summarizing');
    const fullText = transcriptHistoryRef.current.map(t => `${t.role}: ${t.text}`).join('\n');
    
    try {
      const summary = await summarizeConversation(fullText);
      
      // Save to LocalStorage
      const existingStickies = JSON.parse(localStorage.getItem('thai_guide_stickies') || '[]');
      const newSticky = {
        id: Date.now().toString(),
        text: summary,
        date: new Date().toISOString()
      };
      localStorage.setItem('thai_guide_stickies', JSON.stringify([...existingStickies, newSticky]));
      setSummaryMessage("Note added to Plan!");
      setStatus('disconnected');
    } catch (e) {
      console.error("Summary failed", e);
      setStatus('disconnected'); // Revert status on fail
    }
  };

  const connect = async () => {
    // Clear previous session data
    setTranscripts([]);
    transcriptHistoryRef.current = [];
    setSummaryMessage(null);
    setStatus('connecting');
    currentInputRef.current = '';
    currentOutputRef.current = '';
    
    try {
      if (!process.env.API_KEY) {
        throw new Error("API Key not found");
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Setup Audio Contexts
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = audioCtx;
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;

      // Input Stream with enhanced noise cancellation constraints
      const inputStream = await navigator.mediaDevices.getUserMedia({ audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true,
        // Chrome specific constraints for better processing
        googEchoCancellation: true,
        googAutoGainControl: true,
        googNoiseSuppression: true,
        googHighpassFilter: true
      } as any });
      
      streamRef.current = inputStream;

      // Connect to Live API
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log('Live API Connected');
            setStatus('connected');
            setIsConnected(true);
            nextStartTimeRef.current = audioCtx.currentTime;

            // Audio Processing Chain: Source -> Highpass Filter -> ScriptProcessor -> Destination
            const source = inputCtx.createMediaStreamSource(inputStream);
            
            // Add a High-pass filter to remove low-frequency rumble/noise
            const highpass = inputCtx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = 85; // Cut off frequencies below 85Hz
            
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            let lastVolumeUpdate = 0;

            scriptProcessor.onaudioprocess = (e) => {
              if (!inputCtx) return;

              const inputData = e.inputBuffer.getChannelData(0);
              
              // Volume visualization
              const now = Date.now();
              if (now - lastVolumeUpdate > 50) { // Update more frequently for smoother UI
                let sum = 0;
                for (let i = 0; i < inputData.length; i += 10) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / (inputData.length / 10));
                setVolume(Math.min(1, rms * 5));
                lastVolumeUpdate = now;
              }

              // Convert to PCM16
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              
              const base64Data = arrayBufferToBase64(pcm16.buffer);
              const currentSampleRate = inputCtx.sampleRate || 16000;

              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  media: {
                    mimeType: `audio/pcm;rate=${currentSampleRate}`,
                    data: base64Data
                  }
                });
              });
            };

            source.connect(highpass);
            highpass.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
            
            inputSourceRef.current = source;
            processorRef.current = scriptProcessor;
          },
          onmessage: async (msg: LiveServerMessage) => {
            const serverContent = msg.serverContent;
            
            if (serverContent?.outputTranscription) {
               // When model starts talking (output transcription), finalize any pending user input immediately
               // This ensures the user bubble closes before the model bubble starts
               if (currentInputRef.current) {
                  const item: TranscriptItem = { role: 'user', text: currentInputRef.current };
                  setTranscripts(prev => [...prev, item]);
                  transcriptHistoryRef.current.push(item);
                  currentInputRef.current = '';
                  setCurrentInput('');
               }
               
               const text = serverContent.outputTranscription.text;
               currentOutputRef.current += text;
               setCurrentOutput(currentOutputRef.current);
            } else if (serverContent?.inputTranscription) {
               const text = serverContent.inputTranscription.text;
               currentInputRef.current += text;
               setCurrentInput(currentInputRef.current);
            }

            if (serverContent?.turnComplete) {
               if (currentInputRef.current) {
                 const item: TranscriptItem = { role: 'user', text: currentInputRef.current };
                 setTranscripts(prev => [...prev, item]);
                 transcriptHistoryRef.current.push(item);
                 currentInputRef.current = '';
                 setCurrentInput('');
               }
               if (currentOutputRef.current) {
                 const item: TranscriptItem = { role: 'model', text: currentOutputRef.current };
                 setTranscripts(prev => [...prev, item]);
                 transcriptHistoryRef.current.push(item);
                 currentOutputRef.current = '';
                 setCurrentOutput('');
               }
            }

            if (serverContent?.modelTurn?.parts?.[0]?.inlineData) {
              const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
              if (base64Audio) {
                 const data = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
                 const audioBuffer = await decodeAudioData(data, audioCtx, 24000);
                 const source = audioCtx.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(audioCtx.destination);
                 const startTime = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
                 source.start(startTime);
                 nextStartTimeRef.current = startTime + audioBuffer.duration;
              }
            }
            
            if (serverContent?.interrupted) {
               nextStartTimeRef.current = audioCtx.currentTime;
               if (currentOutputRef.current) {
                 const item: TranscriptItem = { role: 'model', text: currentOutputRef.current };
                 setTranscripts(prev => [...prev, item]);
                 transcriptHistoryRef.current.push(item);
                 currentOutputRef.current = '';
                 setCurrentOutput('');
               }
            }
          },
          onclose: () => {
            console.log("Live API Closed");
            disconnect();
          },
          onerror: (err) => {
            console.error("Live API Error", err);
            setStatus('error');
            disconnect();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: { parts: [{ text: `You are Somsri, a friendly, knowledgeable, and helpful Thai travel guide. 
Your persona is constant: a local Thai expert who loves sharing her country with the world.
NEVER break character. Even if the topic changes, you respond as Somsri.
You are multi-lingual. If the user speaks English, French, Chinese, etc., reply fluently in that language, but always maintain your identity as a Thai person helping a visitor.
Use Thai honorifics like 'ka' occasionally and naturally to end sentences, to show politeness and Thai culture.
Speak clearly, enthusiastically, and with a warm, inviting tone.` }]},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          }
        }
      });
      
      sessionRef.current = sessionPromise;

    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  // Ensure clean disconnect on unmount
  useEffect(() => {
    return () => {
      // We don't call disconnect here to preserve state if just navigating away briefly, 
      // but actually for unmount it's better to clean up resources.
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
      if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-between h-full bg-gradient-to-b from-background-light to-white dark:from-background-dark dark:to-gray-900 p-4 relative overflow-hidden">
      
      <div className="flex-1 flex flex-col items-center justify-center w-full z-10 transition-all duration-500" style={{ maxHeight: (transcripts.length > 0 || currentInput || currentOutput) ? '50%' : '100%' }}>
        <div className="mb-6 text-center">
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">Talk to Somsri</h2>
          <p className="text-gray-500 dark:text-gray-400">Real-time voice conversation</p>
        </div>

        <div className="relative w-48 h-48 flex items-center justify-center mb-8">
          {/* Visualizer Circles */}
          {isConnected && (
             <>
              <div 
                className="absolute bg-primary/20 rounded-full transition-all duration-75 ease-out" 
                style={{ 
                  width: `${100 + volume * 150}%`, 
                  height: `${100 + volume * 150}%`, 
                  opacity: 0.2 + volume * 0.5 
                }}
              />
              <div 
                className="absolute bg-primary/30 rounded-full transition-all duration-75 ease-out" 
                style={{ width: `${100 + volume * 80}%`, height: `${100 + volume * 80}%` }}
              />
             </>
          )}
          
          <div className={`z-10 w-32 h-32 rounded-full overflow-hidden border-4 ${isConnected ? 'border-primary' : 'border-gray-300 dark:border-gray-600'} shadow-xl bg-white relative transition-colors duration-300`}>
            <img 
              src="/Somsri-thai-guide.png" 
              alt="Somsri" 
              className="w-full h-full object-cover p-1"
            />
          </div>
        </div>

        {summaryMessage && (
          <div className="mb-4 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 px-4 py-2 rounded-xl shadow-lg animate-fade-in-down flex items-center z-50">
            <span className="material-icons mr-2">check_circle</span>
            {summaryMessage}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={isConnected ? disconnect : connect}
            className={`px-8 py-4 rounded-full font-bold text-lg shadow-lg flex items-center justify-center gap-3 transition-transform active:scale-95 w-64 ${
              isConnected 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-primary hover:bg-primary-dark text-white'
            }`}
          >
            <span className="material-icons">{isConnected ? 'call_end' : 'mic'}</span>
            {isConnected ? 'End Call' : 'Start Conversation'}
          </button>

          {!isConnected && transcripts.length > 0 && !summaryMessage && (
            <button
              onClick={handleCreateSticky}
              disabled={status === 'summarizing'}
              className="px-8 py-3 rounded-full font-semibold text-primary bg-blue-50 hover:bg-blue-100 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-gray-700 shadow-md flex items-center justify-center gap-2 transition-transform active:scale-95 w-64"
            >
              {status === 'summarizing' ? (
                <>
                  <span className="material-icons animate-spin text-sm">refresh</span>
                  Creating Note...
                </>
              ) : (
                <>
                  <span className="material-icons">note_add</span>
                  Create Plan Note
                </>
              )}
            </button>
          )}
        </div>
        
        {status === 'connecting' && (
          <p className="mt-4 text-primary font-medium animate-pulse">Connecting...</p>
        )}
        {status === 'error' && (
          <p className="mt-4 text-red-500">Connection failed. Please try again.</p>
        )}
      </div>

      {/* Transcription Overlay - Visible when connected or has history */}
      {(isConnected || transcripts.length > 0 || currentInput || currentOutput) && (
        <div className="w-full max-w-lg flex-1 bg-white/80 dark:bg-black/40 backdrop-blur-md rounded-2xl p-4 overflow-y-auto z-20 border border-gray-200 dark:border-gray-700 shadow-inner mt-4">
           <div className="space-y-3">
             {transcripts.map((t, i) => (
               <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                 <div className={`max-w-[85%] px-4 py-2 rounded-2xl text-sm ${
                   t.role === 'user' 
                     ? 'bg-primary text-white rounded-br-sm' 
                     : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-bl-sm shadow-sm'
                 }`}>
                   {t.text}
                 </div>
               </div>
             ))}
             
             {/* Pending Inputs */}
             {currentInput && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] px-4 py-2 rounded-2xl text-sm bg-primary/70 text-white/90 rounded-br-sm italic animate-pulse">
                    {currentInput}
                  </div>
                </div>
             )}
             {currentOutput && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] px-4 py-2 rounded-2xl text-sm bg-white/70 dark:bg-gray-700/70 text-gray-800/90 dark:text-gray-100/90 border border-gray-200 dark:border-gray-600 rounded-bl-sm italic">
                    {currentOutput}
                  </div>
                </div>
             )}
             <div ref={messagesEndRef} />
           </div>
        </div>
      )}
    </div>
  );
};
