
import React from 'react';
import { Tab } from '../types';

interface NavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const navItems = [
    { id: Tab.CHAT, label: 'Chat', icon: 'chat_bubble' },
    { id: Tab.PLAN, label: 'Plan', icon: 'calendar_today' },
    { id: Tab.VOICE, label: 'Voice', icon: 'mic' },
  ];

  return (
    <nav className="
      bg-background-light dark:bg-background-dark 
      border-t md:border-t-0 md:border-r border-gray-200 dark:border-gray-800 
      flex md:flex-col justify-around md:justify-start 
      p-2 md:p-4 pb-safe md:w-24 md:h-full md:space-y-8 md:pt-20 z-30
    ">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onTabChange(item.id)}
          className={`flex flex-col items-center justify-center w-1/3 md:w-full transition-colors p-2 rounded-xl ${
            activeTab === item.id
              ? 'text-primary bg-blue-50 dark:bg-gray-800'
              : 'text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span className="material-icons text-2xl md:text-3xl">{item.icon}</span>
          <span className="text-xs font-medium mt-1">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};
