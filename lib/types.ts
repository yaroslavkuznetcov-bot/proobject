export type UserRole = "customer" | "contractor" | "curator";

export type AppUser = {
  login: string;
  role: UserRole;
  name?: string;
};

export type ObjectItem = {
  id: string;
  name: string;
};

export type SiteItem = {
  id: string;
  name: string;
  objectId: string;
};

export type JournalEntry = {
  id: string;
  date: string;
  object: string;
  objectId?: string;
  site: string;
  work: string;
  photo?: string;
  photoUrl?: string;
};

export type JournalPayload = {
  id?: string;
  object: string;
  objectId?: string;
  site: string;
  work: string;
  photo?: string;
  fileName?: string;
  fileMimeType?: string;
};

export type JournalBootstrapData = {
  objects: ObjectItem[];
  sites: SiteItem[];
  journal: JournalEntry[];
};