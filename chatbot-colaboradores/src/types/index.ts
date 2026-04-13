export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AssessmentResponse {
  strengths: string[];
  opportunities: string[];
  rawConversation: Message[];
}

export interface Opportunity {
  area: string;
  description: string;
  resources: Resource[];
}

export interface Resource {
  id: string;
  title: string;
  type: 'course' | 'book' | 'video' | 'webinar' | 'article';
  url: string;
  platform: string;
  duration?: string;
  cost: 'free' | 'paid';
  description: string;
}

export interface Assessment {
  id: string;
  employeeId: string;
  timestamp: Date;
  strengths: string[];
  opportunities: Opportunity[];
  conversationSummary: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  assessments: Assessment[];
}

export interface Role {
  department: 'PD' | 'SD' | 'Customer Success';
  specialty?: 'UX' | 'UI' | 'UX/UI' | 'UX Writers';
}