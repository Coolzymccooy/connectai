import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';
import { Campaign } from '../types';

export const fetchCampaigns = async (): Promise<Campaign[]> => {
  try {
    return await apiGet('/campaigns');
  } catch {
    return [];
  }
};

export const createCampaign = async (campaign: Campaign): Promise<Campaign> => {
  return await apiPost('/campaigns', campaign);
};

export const updateCampaign = async (campaign: Campaign): Promise<Campaign> => {
  return await apiPut(`/campaigns/${campaign.id}`, campaign);
};

export const deleteCampaign = async (id: string): Promise<void> => {
  await apiDelete(`/campaigns/${id}`);
};
