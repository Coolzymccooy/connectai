import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';
import { Meeting } from '../types';

export const fetchCalendarEvents = async (): Promise<Meeting[]> => {
  try {
    return await apiGet('/calendar/events');
  } catch {
    return [];
  }
};

export const createCalendarEvent = async (event: Meeting): Promise<Meeting> => {
  return await apiPost('/calendar/events', event);
};

export const updateCalendarEvent = async (event: Meeting): Promise<Meeting> => {
  return await apiPut(`/calendar/events/${event.id}`, event);
};

export const deleteCalendarEvent = async (id: string): Promise<void> => {
  await apiDelete(`/calendar/events/${id}`);
};
