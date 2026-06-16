export const ACTIVITIES = [
  { id: "board-games", label: "Board games", defaultStart: "19:00", defaultEnd: "23:00" },
  { id: "movies", label: "Movies", defaultStart: "19:00", defaultEnd: "21:30" },
  { id: "bars-drinks", label: "Bars / drinks", defaultStart: "18:00", defaultEnd: "21:00" },
  { id: "hiking", label: "Hiking", defaultStart: "09:00", defaultEnd: "12:00" },
  { id: "concerts", label: "Concerts / shows", defaultStart: "20:00", defaultEnd: "23:00" },
  { id: "food", label: "Food / restaurant", defaultStart: "18:30", defaultEnd: "20:30" },
  { id: "house-party", label: "House party", defaultStart: "19:00", defaultEnd: "23:00" },
  { id: "sports", label: "Sports", defaultStart: "10:00", defaultEnd: "12:00" },
  { id: "coffee", label: "Coffee", defaultStart: "10:00", defaultEnd: "11:30" },
  { id: "just-hang", label: "Just a hang", defaultStart: "18:00", defaultEnd: "21:00" },
];

export const AVAIL_SLOTS = [
  { id: "weekday-day", label: "Weekday days" },
  { id: "weekday-evening", label: "Weekday evenings" },
  { id: "weekend-day", label: "Weekend days" },
  { id: "weekend-evening", label: "Weekend evenings" },
];

export const DIST_TIERS = [
  { id: "local", label: "Local / walkable", mult: 1.0 },
  { id: "nearby", label: "Nearby (<30 min)", mult: 0.85 },
  { id: "driving", label: "Driving (30min+)", mult: 0.6 },
  { id: "far", label: "Far / other city", mult: 0.25 },
];

// How venue proximity modifies distMult per tier.
// mine   = event at your home/block — friend travels to you, full penalty
// out    = neutral venue in your area — everyone travels a bit, penalty compressed
// remote = destination (hike, far venue) — everyone travels a lot, far friends less penalized
export const VENUE_PROXIMITY = [
  { id: "mine", label: "At mine", desc: "Your place or walking distance" },
  { id: "out", label: "Out nearby", desc: "Venue in your area" },
  { id: "remote", label: "Destination", desc: "Hike, trip, or far venue" },
];

export const VENUE_DIST_MULTS = {
  mine: { local: 1.0, nearby: 0.85, driving: 0.6, far: 0.25 },
  out: { local: 1.0, nearby: 0.9, driving: 0.72, far: 0.4 },
  remote: { local: 0.88, nearby: 0.9, driving: 0.82, far: 0.6 },
};

export const COMFORT_LEVELS = [
  { id: "solo", label: "Goes solo", desc: "Comfortable with strangers, no anchor needed" },
  {
    id: "familiar",
    label: "Needs a face",
    desc: "Slight hesitation with all-strangers; +1 helps a bit",
  },
  {
    id: "needs-plus1",
    label: "Needs a +1",
    desc: "Much more likely to come if they can bring someone",
  },
];

// Social energy cost per activity: 0 = effortless, 1 = full battery
export const SOCIAL_ENERGY_COSTS = {
  coffee: 0.15,
  movies: 0.2,
  "board-games": 0.35,
  food: 0.3,
  hiking: 0.4,
  sports: 0.45,
  concerts: 0.5,
  "bars-drinks": 0.55,
  "just-hang": 0.3,
  "house-party": 0.8,
};

export const NOTICE_PREFS = [
  { id: "spontaneous", label: "Spontaneous", days: 0 },
  { id: "few-days", label: "Few days", days: 3 },
  { id: "week", label: "A week", days: 7 },
  { id: "planned", label: "Planned ahead", days: 14 },
];

// Location type for activities — used for location preference scoring
export const ACTIVITY_LOCATION_TYPE = {
  "house-party": "home",
  "board-games": "home",
  movies: "home",
  "bars-drinks": "out",
  concerts: "out",
  food: "out",
  coffee: "out",
  hiking: "either",
  sports: "either",
  "just-hang": "either",
};

export const STATUSES = ["Prospect", "Acquaintance", "Friend", "Close friend"];
export const FREQ_OPTS = [
  { label: "Ad-hoc", days: null },
  { label: "Weekly", days: 7 },
  { label: "Bi-weekly", days: 14 },
  { label: "Monthly", days: 30 },
];

export const LEGACY_SLOT_LABELS = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

export const EMPTY_FRIEND = {
  id: null,
  name: "",
  email: "",
  phone: "",
  contact: "",
  notes: "",
  status: "Friend",
  wantAround: "active",
  busyUntil: null,
  reliability: 3,
  responsiveness: 3,
  vibe: 3,
  openness: 3,
  logistics: 3,
  interests: {},
  groups: [],
  tags: [],
  targetFreqDays: null,
  availSlots: [],
  distanceTier: "nearby",
  comfortLevel: "solo",
  socialType: "ambivert",
  workDrain: "medium",
  noticePreference: "few-days",
  locationPref: "either",
  preferredChannel: "imessage",
  conflicts: [],
  synergies: [],
  lastHangDate: null,
  rankings: {},
  manualFlakes: 0,
};
