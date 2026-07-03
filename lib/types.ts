export type UserRole = "customer" | "contractor" | "curator" | "administrator";

export type AppUser = {
  id: string;
  name: string;
  role: UserRole;
  roleName?: string;
  objects: string[];
  email?: string;
  fullAccess?: boolean;
};

export type ManagedUser = {
  id: string;
  login: string;
  role: UserRole;
  roleName: string;
  objects: string[];
  email?: string;
};

export type ObjectItem = {
  id: string;
  name: string;
  fullName?: string;
  details?: Record<string, string>;
};

export type SiteItem = {
  id: string;
  name: string;
  objectId: string;
};

export type JournalEntry = {
  id: string;
  date: string;
  login?: string;
  object: string;
  objectId: string;
  site: string;
  siteId?: string;
  work: string;
  photoUrl: string;
};

export type JournalBootstrapData = {
  objects: ObjectItem[];
  sites: SiteItem[];
  journal: JournalEntry[];
  users?: ManagedUser[];
};

export type JournalPhotoPayload = {
  data: string;
  fileName: string;
  mimeType: string;
};

export type JournalPayload = {
  id?: string;
  login?: string;
  object: string;
  objectId: string;
  site: string;
  siteId?: string;
  work: string;
  photo?: string;
  fileName?: string;
  fileMimeType?: string;
  photos?: JournalPhotoPayload[];
};
