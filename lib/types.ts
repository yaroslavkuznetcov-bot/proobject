export type UserRole = "customer" | "contractor" | "curator";

export type AppUser = {
  id: string;
  name: string;
  role: UserRole;
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
  objectId: string;
  site: string;
  work: string;
  photoUrl: string;
};

export type JournalBootstrapData = {
  objects: ObjectItem[];
  sites: SiteItem[];
  journal: JournalEntry[];
};

export type JournalPayload = {
  id?: string;
  object: string;
  objectId: string;
  site: string;
  work: string;
  photo?: string;
  fileName?: string;
  fileMimeType?: string;
};
