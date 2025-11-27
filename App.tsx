
import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { ChatInterface } from './components/ChatInterface';
import { PlanInterface } from './components/PlanInterface';
import { VoiceInterface } from './components/VoiceInterface';
import { Tab, Coordinates, Theme } from './types';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.CHAT);
  const [location, setLocation] = useState<Coordinates | undefined>();
  const [theme, setTheme] = useState<Theme>(() => {
    // Initial state from localStorage or system
    if (typeof window !== 'undefined') {
       const saved = localStorage.getItem('theme') as Theme;
       return saved || 'system';
    }
    return 'system';
  });

  // Handle Geolocation
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => console.log('Geolocation not available', error)
      );
    }
  }, []);

  // Handle Theme Logic
  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (t: Theme) => {
      let isDark = false;
      if (t === 'system') {
        isDark = mediaQuery.matches;
      } else {
        isDark = t === 'dark';
      }

      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(theme);
    localStorage.setItem('theme', theme);

    // Listen for system changes if mode is system
    const listener = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        if (e.matches) root.classList.add('dark');
        else root.classList.remove('dark');
      }
    };
    
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  const toggleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const getThemeIcon = () => {
    if (theme === 'system') return 'brightness_auto';
    if (theme === 'light') return 'light_mode';
    return 'dark_mode';
  };

  const renderContent = () => {
    switch (activeTab) {
      case Tab.CHAT:
        return <ChatInterface location={location} />;
      case Tab.PLAN:
        return <PlanInterface />;
      case Tab.VOICE:
        return <VoiceInterface />;
      default:
        return <ChatInterface location={location} />;
    }
  };

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-background-light dark:bg-background-dark text-gray-900 dark:text-white overflow-hidden">
      {/* Navigation - Sidebar on desktop, Bottom on mobile */}
      <div className="order-2 md:order-1 w-full md:w-auto z-30">
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col order-1 md:order-2 h-full relative overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between p-4 bg-white/90 dark:bg-background-dark/90 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800 z-20 absolute top-0 w-full">
          <div className="text-2xl font-bold flex items-center gap-2">
             <img src="/Somsri-thai-guide.png" alt="Logo" className="w-8 h-8 rounded-full bg-white/50 border border-gray-200 dark:border-gray-700" />
             <div className="flex items-center">
               <span className="text-thai-red mr-0.5">Thai</span>
               <span className="text-primary">Guide</span>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleTheme}
              className="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded-full transition-colors"
              title={`Theme: ${theme}`}
            >
              <span className="material-icons">{getThemeIcon()}</span>
            </button>
            <button className="md:hidden text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded-full transition-colors">
              <span className="material-icons">menu</span>
            </button>
          </div>
        </header>

        {/* Content Body with top padding for header */}
        <main className="flex-1 overflow-hidden pt-16">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default App;