
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { generatePlan, transcribeAudio } from '../services/geminiService';

interface SavedPlan {
  id: string;
  topic: string;
  content: string;
  timestamp: number;
}

export const PlanInterface: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [plan, setPlan] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [showSavedList, setShowSavedList] = useState(false);

  // Voice input state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load plans from local storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('thai_guide_saved_plans');
      if (stored) {
        setSavedPlans(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load plans", e);
    }
  }, []);

  const saveToLocalStorage = (plans: SavedPlan[]) => {
    localStorage.setItem('thai_guide_saved_plans', JSON.stringify(plans));
    setSavedPlans(plans);
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
        setIsTranscribing(true);
        try {
          const text = await transcribeAudio(audioBlob);
          setTopic(prev => (prev ? prev + ' ' : '') + text);
        } catch (e) {
          console.error("Transcription failed", e);
        } finally {
          setIsTranscribing(false);
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

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setIsThinking(true);
    setPlan('');
    setShowSavedList(false);
    try {
      const result = await generatePlan(`Create a detailed itinerary or plan for: ${topic}`);
      setPlan(result);
    } catch (e) {
      setPlan("Sorry, I couldn't generate the plan right now.");
    } finally {
      setIsThinking(false);
    }
  };

  const handleSavePlan = () => {
    if (!plan || !topic) return;
    
    const newPlan: SavedPlan = {
      id: Date.now().toString(),
      topic: topic,
      content: plan,
      timestamp: Date.now()
    };
    
    const updatedPlans = [newPlan, ...savedPlans];
    saveToLocalStorage(updatedPlans);
    alert('Plan saved successfully!');
  };

  const handleDeletePlan = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updatedPlans = savedPlans.filter(p => p.id !== id);
    saveToLocalStorage(updatedPlans);
  };

  const handleLoadPlan = (savedPlan: SavedPlan) => {
    setTopic(savedPlan.topic);
    setPlan(savedPlan.content);
    setShowSavedList(false);
  };

  const handleExportICal = () => {
    if (!plan) return;
    
    // Create a simple iCal event
    const now = new Date();
    const startDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    // Default to 3 day duration
    const endDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    // Escape newlines for iCal format
    const description = plan.replace(/\n/g, '\\n').substring(0, 7000); // Truncate if too long to prevent issues

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ThaiGuide//Travel Plan//EN
BEGIN:VEVENT
UID:${Date.now()}@thaiguide.app
DTSTAMP:${startDate}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:Trip to ${topic}
DESCRIPTION:${description}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `trip_plan_${Date.now()}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddToGoogleCalendar = () => {
    if (!plan) return;
    // URL limit is around 2000 chars for some browsers, safely truncate
    const details = encodeURIComponent(plan.substring(0, 1500) + "\n\n... (Plan truncated, see app for full details)");
    const title = encodeURIComponent(`Trip Plan: ${topic}`);
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}`;
    window.open(url, '_blank');
  };

  const handleAddToMaps = () => {
    if (!topic) return;
    // Opens a search for the location to easily save places
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(topic)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark p-4 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
               <div className="relative group cursor-pointer hover:scale-105 transition-transform">
                 <img 
                   src="/pad-thai.png" 
                   alt="Pad Thai" 
                   className="w-14 h-14 object-contain drop-shadow-md"
                 />
                 <span className="absolute -bottom-1 -right-1 text-xl group-hover:rotate-12 transition-transform">🗺️</span>
               </div>
               <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Travel Planner</h2>
            </div>
            
            <button 
              onClick={() => setShowSavedList(!showSavedList)}
              className="text-primary text-sm font-medium hover:underline flex items-center bg-blue-50 dark:bg-gray-700 px-3 py-2 rounded-lg transition-colors"
            >
              <span className="material-icons text-sm mr-1">{showSavedList ? 'add' : 'history'}</span>
              {showSavedList ? 'New Plan' : 'Saved Plans'}
            </button>
          </div>
          
          {!showSavedList && (
            <>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                I use advanced reasoning to create detailed, day-by-day itineraries for you.
              </p>
              
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Where do you want to go?
                </label>
                <div className="relative">
                  <textarea
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-3 text-sm text-gray-900 dark:text-gray-100 focus:ring-primary focus:border-primary pr-10 resize-none"
                    rows={3}
                    placeholder="e.g., A 3-day trip to Chiang Mai focusing on temples and nature..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={isThinking || isTranscribing}
                  />
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isThinking || (isTranscribing && !isRecording)}
                    className={`absolute bottom-2 right-2 p-2 rounded-full transition-colors ${
                      isRecording 
                        ? 'bg-red-500 text-white animate-pulse' 
                        : 'text-gray-400 hover:text-primary hover:bg-gray-200 dark:hover:bg-gray-700 bg-transparent'
                    } ${isTranscribing ? 'opacity-50 cursor-wait' : ''}`}
                    title={isRecording ? "Stop recording" : "Speak to input"}
                  >
                    <span className="material-icons text-xl">{isRecording ? 'stop' : 'mic'}</span>
                  </button>
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={isThinking || isTranscribing || !topic.trim()}
                  className="mt-3 w-full bg-primary hover:bg-primary-dark text-white font-medium py-3 px-4 rounded-xl transition-all shadow-md active:scale-[0.99] flex items-center justify-center disabled:opacity-50 disabled:shadow-none"
                >
                  {isThinking ? (
                    <>
                      <span className="material-icons animate-spin mr-2 text-sm">refresh</span>
                      Thinking...
                    </>
                  ) : (
                    'Generate Plan'
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {showSavedList ? (
          <div className="space-y-3">
             {savedPlans.length === 0 ? (
               <div className="text-center py-10 text-gray-500">
                 <span className="material-icons text-4xl mb-2 text-gray-300">fact_check</span>
                 <p>No saved plans yet.</p>
               </div>
             ) : (
               savedPlans.map(p => (
                 <div 
                   key={p.id}
                   onClick={() => handleLoadPlan(p)}
                   className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-primary transition-colors flex justify-between items-start"
                 >
                   <div>
                     <h3 className="font-bold text-gray-900 dark:text-white line-clamp-1">{p.topic}</h3>
                     <p className="text-xs text-gray-500 mt-1">
                       {new Date(p.timestamp).toLocaleDateString()}
                     </p>
                   </div>
                   <button 
                     onClick={(e) => handleDeletePlan(e, p.id)}
                     className="text-gray-400 hover:text-red-500 p-1"
                   >
                     <span className="material-icons text-sm">delete</span>
                   </button>
                 </div>
               ))
             )}
          </div>
        ) : (
          <>
            {plan && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 animate-fade-in mb-20">
                {/* Action Bar */}
                <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
                  <button 
                    onClick={handleSavePlan}
                    className="flex items-center px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                  >
                    <span className="material-icons text-sm mr-1">save</span> Save
                  </button>
                  <button 
                    onClick={handleExportICal}
                    className="flex items-center px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                  >
                    <span className="material-icons text-sm mr-1">event</span> iCal
                  </button>
                  <button 
                    onClick={handleAddToGoogleCalendar}
                    className="flex items-center px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                  >
                    <span className="material-icons text-sm mr-1">calendar_today</span> G-Cal
                  </button>
                  <button 
                    onClick={handleAddToMaps}
                    className="flex items-center px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                  >
                    <span className="material-icons text-sm mr-1">place</span> Maps
                  </button>
                </div>

                <div className="prose dark:prose-invert max-w-none text-sm sm:text-base">
                  <ReactMarkdown>{plan}</ReactMarkdown>
                </div>
              </div>
            )}
            
            {isThinking && (
               <div className="flex flex-col items-center justify-center py-10 opacity-70">
                  <span className="material-icons text-4xl text-primary animate-pulse mb-2">psychology</span>
                  <p className="text-sm">Analyzing options and crafting your itinerary...</p>
               </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};