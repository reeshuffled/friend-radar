export const BASE = {
    contact: "", email: "", notes: "", status: "Friend",
    wantAround: 'active', busyUntil: null,
    reliability: 3, responsiveness: 3, vibe: 3, openness: 3, logistics: 3,
    interests: {}, groups: [], tags: [], targetFreqDays: null,
    availSlots: [], distanceTier: "nearby",
    comfortLevel: "solo",
    socialType: "ambivert",
    workDrain: "medium",
    noticePreference: "few-days",
    locationPref: "either",
    lastHangDate: null,
    rankings: {},
    manualFlakes: 0,
  };
  
  export const SEED_FRIENDS = [];
  
  export const EMPTY_FRIEND = { ...BASE, name: "", id: null, phone: "", preferredChannel: "imessage", conflicts: [], synergies: [] };
  