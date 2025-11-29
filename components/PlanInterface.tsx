
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { generatePlan, transcribeAudio } from '../services/geminiService';
import { GroundingPlace } from '../types';

// Use a distinct API key for Maps Embed if needed, or reuse the environment one if compatible
// Ideally this should be a restricted browser key. 
const MAPS_API_KEY = process.env.API_KEY || ""; 

interface PlanItem {
  id: string;
  type: 'header' | 'paragraph' | 'task' | 'section' | 'key-value';
  content: string;
  key?: string; // For key-value pairs
  value?: string; // For key-value pairs
  isCompleted: boolean;
  metadata?: any;
}

interface SavedPlan {
  id: string;
  topic: string;
  items: PlanItem[];
  timestamp: number;
  places?: GroundingPlace[];
  destination?: string;
}

interface VoiceSticky {
  id: string;
  text: string;
  date: string;
}

interface PlanInterfaceProps {
  suggestedPlaces: GroundingPlace[];
  setSuggestedPlaces: React.Dispatch<React.SetStateAction<GroundingPlace[]>>;
}

const safeOpen = (url: string) => {
  const newWindow = window.open(url, '_blank');
  if (newWindow) {
    newWindow.opener = null;
  }
};

const parseMarkdownToItems = (markdown: string): PlanItem[] => {
  if (!markdown) return [];
  
  const lines = markdown.split('\n');
  const items: PlanItem[] = [];
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('> ')) {
        // Section Header (Time/Activity Title)
        items.push({
            id: `sec-${index}`,
            type: 'section',
            content: trimmed.substring(2).trim(),
            isCompleted: false
        });
    } else if (trimmed.match(/^\*\s\*\*(.*?):\*\*\s*(.*)/)) {
        // Key-Value Pair (e.g., * **The Plan:** Do something)
        const match = trimmed.match(/^\*\s\*\*(.*?):\*\*\s*(.*)/);
        if (match) {
            items.push({
                id: `kv-${index}`,
                type: 'key-value',
                content: trimmed,
                key: match[1],
                value: match[2],
                isCompleted: false
            });
        }
    } else if (trimmed.startsWith('#')) {
      items.push({
        id: `head-${index}`,
        type: 'header',
        content: trimmed.replace(/^#+\s*/, ''),
        isCompleted: false
      });
    } else if (trimmed.match(/^[-*]\s/) || trimmed.match(/^\d+\.\s/)) {
      let content = trimmed.replace(/^[-*]\s/, '').replace(/^\d+\.\s/, '');
      let isCompleted = false;
      if (content.startsWith('[x] ') || content.startsWith('[X] ')) {
        isCompleted = true;
        content = content.replace(/^\[[xX]\]\s/, '');
      } else if (content.startsWith('[ ] ')) {
        content = content.replace(/^\[ \]\s/, '');
      }
      items.push({
        id: `task-${index}`,
        type: 'task',
        content,
        isCompleted
      });
    } else {
      items.push({
        id: `p-${index}`,
        type: 'paragraph',
        content: trimmed,
        isCompleted: false
      });
    }
  });
  
  return items;
};

const itemsToMarkdown = (items: PlanItem[]): string => {
  return items.map(item => {
    if (item.type === 'section') return `> ${item.content}`;
    if (item.type === 'key-value') return `* **${item.key}:** ${item.value}`;
    if (item.type === 'header') return `## ${item.content}`;
    if (item.type === 'task') return `- ${item.isCompleted ? '[x] ' : ''}${item.content}`;
    return item.content;
  }).join('\n\n');
};

const LocationCard: React.FC<{ placeName: string; destination?: string }> = ({ placeName, destination }) => {
    // Construct a safe query for embedding
    const query = destination ? `${placeName}, ${destination}` : placeName;
    const mapSrc = `https://www.google.com/maps/embed/v1/place?key=${MAPS_API_KEY}&q=${encodeURIComponent(query)}`;

    return (
        <div className="mt-3 mb-4 rounded-xl overflow-hidden shadow-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="h-48 w-full relative bg-gray-100">
                 {/* Google Maps Embed */}
                 <iframe
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    src={mapSrc}
                    title={`Map of ${placeName}`}
                ></iframe>
            </div>
            <div className="p-3 flex justify-between items-center bg-gray-50 dark:bg-gray-700/50">
                <div className="flex flex-col">
                    <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">{placeName}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">View on Google Maps</span>
                </div>
                <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-primary hover:bg-blue-200 transition-colors"
                >
                    <span className="material-icons text-sm">open_in_new</span>
                </a>
            </div>
        </div>
    );
};

const PlanItemRow: React.FC<{
  item: PlanItem;
  destination?: string;
  onUpdate: (id: string, content: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ item, destination, onUpdate, onToggle, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.content);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editValue.trim()) {
        // Simple update logic - for key-value we might want to parse back, but for now just updating raw content
        onUpdate(item.id, editValue);
    }
    setIsEditing(false);
  };

  const renderContent = () => {
      if (item.type === 'section') {
          return (
              <div className="flex items-center text-primary font-bold text-lg mt-4 mb-2 pb-1 border-b-2 border-blue-50 dark:border-gray-700/50">
                  <span className="mr-2">▶</span>
                  {item.content}
              </div>
          );
      }
      if (item.type === 'key-value') {
          return (
              <div className="ml-2 mb-2">
                  <span className="font-bold text-blue-600 dark:text-blue-400">{item.key}:</span>
                  <span className="ml-2 text-gray-700 dark:text-gray-300">{item.value}</span>
                  {/* If this is a Location key, render the map card below it */}
                  {(item.key === 'Location' || item.key === 'Place') && item.value && (
                      <LocationCard placeName={item.value} destination={destination} />
                  )}
              </div>
          );
      }
      
      return (
        <div 
            onClick={() => setIsEditing(true)}
            className={`cursor-text py-0.5 text-sm ${
            item.type === 'header' 
                ? 'font-bold text-lg text-gray-900 dark:text-white mt-4' 
                : 'text-gray-700 dark:text-gray-300'
            } ${item.isCompleted ? 'line-through decoration-gray-400' : ''}`}
        >
            {item.content}
        </div>
      );
  }

  return (
    <div className={`group relative transition-colors ${item.type === 'task' ? 'pl-8' : ''}`}>
      {item.type === 'task' && (
        <button
          onClick={() => onToggle(item.id)}
          className={`absolute left-0 top-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
            item.isCompleted
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary'
          }`}
        >
          {item.isCompleted && <span className="material-icons text-sm">check</span>}
        </button>
      )}
      
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <textarea
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); } }}
            className="w-full bg-white dark:bg-gray-900 border border-primary rounded p-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none resize-none overflow-hidden"
            rows={1}
          />
        ) : renderContent()}
      </div>

      <button 
        onClick={() => onDelete(item.id)}
        className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
        title="Delete item"
      >
        <span className="material-icons text-sm">delete</span>
      </button>
    </div>
  );
};

export const PlanInterface: React.FC<PlanInterfaceProps> = ({ suggestedPlaces, setSuggestedPlaces }) => {
  const [topic, setTopic] = useState('');
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [destination, setDestination] = useState<string>('');
  const [isThinking, setIsThinking] = useState(false);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [showSavedList, setShowSavedList] = useState(false);
  const [stickies, setStickies] = useState<VoiceSticky[]>([]);

  // Voice input state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('thai_guide_saved_plans');
      if (stored) {
        const parsed = JSON.parse(stored).map((p: any) => ({
          ...p,
          items: p.items || parseMarkdownToItems(p.content)
        }));
        setSavedPlans(parsed);
      }
      
      // Load Voice Stickies
      const storedStickies = localStorage.getItem('thai_guide_stickies');
      if (storedStickies) {
        setStickies(JSON.parse(storedStickies));
      }
    } catch (e) {
      console.error("Failed to load plans", e);
    }
  }, []);

  const saveToLocalStorage = (plans: SavedPlan[]) => {
    localStorage.setItem('thai_guide_saved_plans', JSON.stringify(plans));
    setSavedPlans(plans);
  };

  const updateStickies = (newStickies: VoiceSticky[]) => {
    localStorage.setItem('thai_guide_stickies', JSON.stringify(newStickies));
    setStickies(newStickies);
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
    setPlanItems([]);
    setShowSavedList(false);
    try {
      const result = await generatePlan(`Create a detailed itinerary or plan for: ${topic}`);
      const items = parseMarkdownToItems(result.text);
      setPlanItems(items);
      setDestination(result.destination || "");
      // Append new places to shared suggested places, avoiding duplicates
      if (result.places && result.places.length > 0) {
          setSuggestedPlaces(prev => {
              const newPlaces = result.places.filter(np => !prev.some(op => op.uri === np.uri));
              return [...prev, ...newPlaces];
          });
      }
    } catch (e) {
      setPlanItems([{ id: 'error', type: 'paragraph', content: "Sorry, I couldn't generate the plan right now.", isCompleted: false }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSavePlan = () => {
    if (planItems.length === 0 || !topic) return;
    
    const newPlan: SavedPlan = {
      id: Date.now().toString(),
      topic: topic,
      items: planItems,
      timestamp: Date.now(),
      destination: destination,
      places: suggestedPlaces // Save currently suggested places with the plan
    };
    
    const updatedPlans = [newPlan, ...savedPlans];
    saveToLocalStorage(updatedPlans);
    alert('Plan saved successfully!');
  };

  const handleDeletePlan = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this saved plan?")) {
      const updatedPlans = savedPlans.filter(p => p.id !== id);
      saveToLocalStorage(updatedPlans);
    }
  };

  const handleLoadPlan = (savedPlan: SavedPlan) => {
    setTopic(savedPlan.topic);
    setPlanItems(savedPlan.items || parseMarkdownToItems((savedPlan as any).content));
    setDestination(savedPlan.destination || "");
    setSuggestedPlaces(savedPlan.places || []);
    setShowSavedList(false);
  };

  // Item Management
  const handleUpdateItem = (id: string, newContent: string) => {
    setPlanItems(prev => prev.map(item => item.id === id ? { ...item, content: newContent } : item));
  };

  const handleToggleItem = (id: string) => {
    setPlanItems(prev => prev.map(item => item.id === id ? { ...item, isCompleted: !item.isCompleted } : item));
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm("Delete this item?")) {
      setPlanItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const handleAddItem = () => {
    const newItem: PlanItem = {
      id: `new-${Date.now()}`,
      type: 'task',
      content: 'New task...',
      isCompleted: false
    };
    setPlanItems([...planItems, newItem]);
  };

  // Sticky Management
  const handleAddStickyToPlan = (sticky: VoiceSticky) => {
    const newItem: PlanItem = {
        id: `sticky-${Date.now()}`,
        type: 'task',
        content: sticky.text,
        isCompleted: false
    };
    setPlanItems([...planItems, newItem]);
  };

  const handleDeleteSticky = (id: string) => {
      if(window.confirm("Remove this voice note?")) {
          const next = stickies.filter(s => s.id !== id);
          updateStickies(next);
      }
  };

  // Place Management
  const handleAddPlaceToPlan = (place: GroundingPlace) => {
    const newItem: PlanItem = {
      id: `place-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type: 'key-value',
      content: `* **Location:** ${place.title}`,
      key: 'Location',
      value: place.title,
      isCompleted: false
    };
    setPlanItems(prev => [...prev, newItem]);
  };

  const handleRemovePlace = (place: GroundingPlace) => {
    setSuggestedPlaces(prev => prev.filter(p => p.uri !== place.uri));
  };

  const handleExportICal = () => {
    if (planItems.length === 0) return;
    
    const now = new Date();
    const startDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    const planString = itemsToMarkdown(planItems);
    const description = planString.replace(/\n/g, '\\n').substring(0, 7000);

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
    if (planItems.length === 0) return;
    const planString = itemsToMarkdown(planItems);
    const details = encodeURIComponent(planString.substring(0, 1500) + "\n\n... (Plan truncated, see app for full details)");
    const title = encodeURIComponent(`Trip Plan: ${topic}`);
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}`;
    safeOpen(url);
  };

  const handleAddToMaps = () => {
    if (!topic && suggestedPlaces.length === 0) return;
    
    let url = '';
    // Construct a route if we have multiple places
    if (suggestedPlaces.length > 1) {
        const origin = encodeURIComponent(suggestedPlaces[0].title);
        const destinationPlace = encodeURIComponent(suggestedPlaces[suggestedPlaces.length - 1].title);
        const waypoints = suggestedPlaces.slice(1, -1).map(p => encodeURIComponent(p.title)).join('|');
        url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destinationPlace}&waypoints=${waypoints}`;
    } else if (suggestedPlaces.length === 1) {
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(suggestedPlaces[0].title)}`;
    } else if (destination) {
        // Fallback to destination search
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
    } else {
        // Fallback to topic
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(topic)}`;
    }
    safeOpen(url);
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
                I create structured itineraries with maps, reviews, and local tips!
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
                      Planning your trip...
                    </>
                  ) : (
                    'Generate Plan'
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Voice Stickies Section */}
        {!showSavedList && stickies.length > 0 && (
            <div className="mb-6 overflow-x-auto">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center">
                    <span className="material-icons text-sm mr-1">mic</span> Voice Notes
                </h3>
                <div className="flex gap-3 pb-2">
                    {stickies.map(sticky => (
                        <div key={sticky.id} className="min-w-[200px] w-[200px] bg-yellow-100 dark:bg-yellow-900/40 p-3 rounded-lg border border-yellow-200 dark:border-yellow-700 shadow-sm relative group flex flex-col justify-between">
                            <p className="text-xs text-gray-800 dark:text-gray-200 font-handwriting mb-2 line-clamp-4 leading-relaxed">
                                "{sticky.text}"
                            </p>
                            <div className="flex justify-between items-center mt-2 border-t border-yellow-200 dark:border-yellow-800 pt-2">
                                <span className="text-[10px] text-gray-500">{new Date(sticky.date).toLocaleDateString()}</span>
                                <div className="flex gap-1">
                                    <button 
                                        onClick={() => handleAddStickyToPlan(sticky)} 
                                        className="bg-white dark:bg-gray-800 p-1.5 rounded-full hover:bg-yellow-50 dark:hover:bg-gray-700 text-green-600 transition-colors"
                                        title="Add to Plan"
                                    >
                                        <span className="material-icons text-sm">add</span>
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteSticky(sticky.id)}
                                        className="bg-white dark:bg-gray-800 p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-gray-700 text-red-500 transition-colors"
                                        title="Discard"
                                    >
                                        <span className="material-icons text-sm">close</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Suggested Places Section - Shared State */}
        {!showSavedList && suggestedPlaces.length > 0 && (
             <div className="mb-6 overflow-x-auto">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center">
                    <span className="material-icons text-sm mr-1">place</span> Suggested Places
                </h3>
                <div className="flex gap-3 pb-2">
                    {suggestedPlaces.map((place, idx) => (
                        <div key={idx} className="min-w-[200px] w-[200px] bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm relative group flex flex-col justify-between">
                            <div className="mb-2">
                                <a href={place.uri} target="_blank" rel="noopener noreferrer" className="font-bold text-sm text-primary hover:underline line-clamp-2" title={place.title}>
                                    {place.title}
                                </a>
                            </div>
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                <span className="text-[10px] text-gray-400">Source</span>
                                <div className="flex gap-1">
                                    <button 
                                        onClick={() => handleAddPlaceToPlan(place)} 
                                        className="bg-green-50 dark:bg-green-900/20 p-1.5 rounded-full hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 transition-colors"
                                        title="Add to Itinerary"
                                    >
                                        <span className="material-icons text-sm">add</span>
                                    </button>
                                    <button 
                                        onClick={() => handleRemovePlace(place)}
                                        className="bg-red-50 dark:bg-red-900/20 p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 dark:text-red-400 transition-colors"
                                        title="Remove Source"
                                    >
                                        <span className="material-icons text-sm">close</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

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
            {planItems.length > 0 && (
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
                    <span className="material-icons text-sm mr-1">place</span>
                    {suggestedPlaces.length > 1 ? 'View Route' : 'Maps'}
                  </button>
                </div>

                <div className="space-y-1">
                  {planItems.map(item => (
                    <PlanItemRow 
                      key={item.id} 
                      item={item} 
                      destination={destination}
                      onUpdate={handleUpdateItem}
                      onToggle={handleToggleItem}
                      onDelete={handleDeleteItem}
                    />
                  ))}
                </div>
                
                <button
                  onClick={handleAddItem}
                  className="mt-6 w-full py-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-gray-400 hover:text-primary hover:border-primary transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-icons text-sm">add</span>
                  Add Task or Note
                </button>
              </div>
            )}
            
            {isThinking && (
               <div className="flex flex-col items-center justify-center py-10 opacity-70">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
                  <p className="text-sm">Consulting maps and creating your guide...</p>
               </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
