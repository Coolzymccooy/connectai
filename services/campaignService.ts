import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';
import { Campaign } from '../types';

export const fetchCampaigns = async (): Promise<Campaign[]> => {
  try {
    return await apiGet('/api/marketing/campaigns');
  } catch {
    return [];
  }
};

export const createCampaign = async (campaign: Campaign): Promise<Campaign> => {
  return await apiPost('/api/marketing/campaigns', campaign);
};

export const updateCampaign = async (campaign: Campaign): Promise<Campaign> => {
  return await apiPut(`/api/marketing/campaigns/${campaign.id}`, campaign);
};

export const deleteCampaign = async (id: string): Promise<void> => {
  await apiDelete(`/api/marketing/campaigns/${id}`);
};
