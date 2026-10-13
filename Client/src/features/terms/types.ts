export interface Term {
  id: number;
  name: string;
  isCurrent: boolean;
}

export interface CreateTermPayload {
  name: string;
}
