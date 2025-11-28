
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, Coordinates } from '../types';
import { sendMessage, transcribeAudio, generateSpeech } from '../services/geminiService';

interface ChatInterfaceProps {
  location?: Coordinates;
}

const MapPreview: React.FC<{ location: Coordinates }> = ({ location }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!mapRef.current || !(window as any).L) return;
    
    const L = (window as any).L;
    
    // Fix for default marker icons in webpack/react environments if needed, 
    // though here we are using CDN which simplifies things.
    const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
    });

    const map = L.map(mapRef.current, {
        center: [location.latitude, location.longitude],
        zoom: 14,
        zoomControl: true,
        attributionControl: false
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.marker([location.latitude, location.longitude], { icon }).addTo(map);
    
    // Force a resize calculation after render to prevent grey tiles
    setTimeout(() => {
        map.invalidateSize();
    }, 100);

    return () => {
        map.remove();
    }
  }, [location]);

  return <div ref={mapRef} className="h-48 w-full rounded-lg mt-3 z-0 border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm" />;
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ location }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Sawasdee ka! I am Somsri. How can I help you plan your trip or guide you today? Ask me anything.',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const response = await sendMessage(userMsg.text, history, location);
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text,
        timestamp: new Date(),
        groundingSources: response.groundingSources,
        location: response.location,
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error(error);
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'model',
        text: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsRecording(false);
        setIsLoading(true);
        try {
          const text = await transcribeAudio(audioBlob);
          setInputValue(text);
        } catch (e) {
          console.error("Transcription failed", e);
        } finally {
          setIsLoading(false);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const handleTTS = async (text: string, id: string) => {
    if (isPlayingAudio === id) return;
    
    try {
      setIsPlayingAudio(id);
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioData = await generateSpeech(text);
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsPlayingAudio(null);
      source.start();
    } catch (e) {
      console.error("TTS play failed", e);
      setIsPlayingAudio(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark relative">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 md:pb-28">
        <div className="max-w-4xl mx-auto w-full space-y-6">
          <div className="flex items-start gap-3">
            <div className="relative">
              <img
                alt="Somsri avatar"
                className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-md"
                src="/Somsri_SVG.svg"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></span>
            </div>
            <div className="flex flex-col items-start max-w-[85%] md:max-w-[70%]">
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-3 mb-1 font-medium">Somsri</span>
            </div>
          </div>
          
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               {msg.role === 'model' && (
                 <div className="mr-2 mt-2 hidden sm:block">
                    <img
                      alt="Somsri avatar"
                      className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                      src="/Somsri_SVG.svg"
                    />
                 </div>
               )}
              <div
                className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-thai-red text-white rounded-br-none'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-none border border-gray-100 dark:border-gray-700'
                }`}
              >
                <div className="prose dark:prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>

                {msg.location && (
                  <MapPreview location={msg.location} />
                )}
                
                {msg.groundingSources && msg.groundingSources.length > 0 && (
                   <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs">
                      <p className="font-semibold mb-1 opacity-70">Sources:</p>
                      <div className="flex flex-wrap gap-2">
                        {msg.groundingSources.map((source, idx) => (
                          <a 
                            key={idx} 
                            href={source.uri} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-primary hover:underline truncate max-w-[200px]"
                          >
                            {source.title}
                          </a>
                        ))}
                      </div>
                   </div>
                )}

                {msg.role === 'model' && (
                  <div className="mt-2 flex justify-end">
                    <button 
                      onClick={() => handleTTS(msg.text, msg.id)}
                      className={`p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition ${isPlayingAudio === msg.id ? 'text-primary' : 'text-gray-400'}`}
                      title="Read aloud"
                    >
                      <span className="material-icons text-sm">volume_up</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
               <div className="mr-2 mt-2 hidden sm:block">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
               </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl rounded-bl-none border border-gray-100 dark:border-gray-700">
                 <span className="flex gap-1">
                   <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                   <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></span>
                   <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></span>
                 </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="bg-background-light dark:bg-background-dark p-3 border-t border-gray-200 dark:border-gray-800 sticky bottom-0 z-10 w-full">
        <div className="max-w-4xl mx-auto w-full flex items-center space-x-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type your message..."
              className="w-full bg-white dark:bg-gray-800 border-none focus:ring-2 focus:ring-primary rounded-full py-3 pl-4 pr-4 text-gray-800 dark:text-gray-200 placeholder-gray-500 shadow-sm"
              disabled={isLoading || isRecording}
            />
          </div>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-12 h-12 flex items-center justify-center rounded-full shadow-md transition-all ${
              isRecording ? 'bg-red-500 animate-pulse text-white' : 'bg-white dark:bg-gray-700 text-thai-red hover:bg-red-50 dark:hover:bg-gray-600'
            }`}
          >
            <span className="material-icons">{isRecording ? 'stop' : 'mic'}</span>
          </button>
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-primary text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-dark transition-colors"
          >
            <span className="material-icons">send</span>
          </button>
        </div>
      </div>
    </div>
  );
};