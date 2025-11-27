
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isAudio?: boolean;
  groundingSources?: GroundingSource[];
  isLoading?: boolean;
  location?: Coordinates;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export enum Tab {
  CHAT = 'chat',
  PLAN = 'plan',
  VOICE = 'voice',
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type Theme = 'system' | 'light' | 'dark';
