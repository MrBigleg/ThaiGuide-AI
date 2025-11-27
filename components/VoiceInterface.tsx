
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { decodeAudioData, arrayBufferToBase64 } from '../services/audioUtils';

export const VoiceInterface: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [volume, setVolume] = useState(0); // For visualization

  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<Promise<any> | null>(null); 

  const disconnect = () => {
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
    setStatus('disconnected');
    setVolume(0);
  };

  const connect = async () => {
    setStatus('connecting');
    try {
      if (!process.env.API_KEY) {
        throw new Error("API Key not found");
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Setup Audio Contexts
      // Output context (usually 24k or 48k is fine for playback)
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = audioCtx;
      
      // Input Context - we try to ask for 16k to match model preference, but browser might ignore
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;

      // Input Stream
      const inputStream = await navigator.mediaDevices.getUserMedia({ audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true
      }});
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

            // Start Audio Processing
            const source = inputCtx.createMediaStreamSource(inputStream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            let lastVolumeUpdate = 0;

            scriptProcessor.onaudioprocess = (e) => {
              if (!inputCtx) return; // Guard against disconnected state

              const inputData = e.inputBuffer.getChannelData(0);
              
              // Throttle volume updates to avoid blocking main thread (causes network drops)
              const now = Date.now();
              if (now - lastVolumeUpdate > 100) {
                let sum = 0;
                // Sample every 10th point for efficiency
                for (let i = 0; i < inputData.length; i += 10) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / (inputData.length / 10));
                setVolume(Math.min(1, rms * 5)); // Amplify slightly for better visual
                lastVolumeUpdate = now;
              }

              // Convert to PCM16
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                // Clip values to -1..1 range before scaling
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              
              const base64Data = arrayBufferToBase64(pcm16.buffer);
              
              // Use the actual sample rate of the context, which might differ from requested
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

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
            
            inputSourceRef.current = source;
            processorRef.current = scriptProcessor;
          },
          onmessage: async (msg: LiveServerMessage) => {
            const serverContent = msg.serverContent;
            if (serverContent?.modelTurn?.parts?.[0]?.inlineData) {
              const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
              if (base64Audio) {
                 const data = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
                 // Decode 24kHz audio from model
                 const audioBuffer = await decodeAudioData(data, audioCtx, 24000);
                 
                 const source = audioCtx.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(audioCtx.destination);
                 
                 // Schedule playback
                 const startTime = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
                 source.start(startTime);
                 nextStartTimeRef.current = startTime + audioBuffer.duration;
              }
            }
            
            if (serverContent?.interrupted) {
               nextStartTimeRef.current = audioCtx.currentTime; 
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

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-background-light to-white dark:from-background-dark dark:to-gray-900 p-6">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">Talk to Somsri</h2>
        <p className="text-gray-500 dark:text-gray-400">Real-time voice conversation powered by Gemini Live</p>
      </div>

      <div className="relative w-48 h-48 flex items-center justify-center mb-12">
        {/* Visualizer Circles */}
        {isConnected && (
           <>
            <div 
              className="absolute bg-primary/20 rounded-full transition-all duration-100 ease-out" 
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
        
        <div className={`z-10 w-32 h-32 rounded-full overflow-hidden border-4 ${isConnected ? 'border-primary' : 'border-gray-300 dark:border-gray-600'} shadow-xl bg-white relative`}>
          <img 
            src="/Somsri-thai-guide.png" 
            alt="Somsri" 
            className="w-full h-full object-cover p-1"
          />
        </div>
      </div>

      <button
        onClick={isConnected ? disconnect : connect}
        className={`px-8 py-4 rounded-full font-bold text-lg shadow-lg flex items-center gap-3 transition-transform active:scale-95 ${
          isConnected 
            ? 'bg-red-500 hover:bg-red-600 text-white' 
            : 'bg-primary hover:bg-primary-dark text-white'
        }`}
      >
        <span className="material-icons">{isConnected ? 'call_end' : 'mic'}</span>
        {isConnected ? 'End Call' : 'Start Conversation'}
      </button>
      
      {status === 'connecting' && (
        <p className="mt-4 text-primary font-medium animate-pulse">Connecting...</p>
      )}
      {status === 'error' && (
        <p className="mt-4 text-red-500">Connection failed. Please try again.</p>
      )}
    </div>
  );
};