
import { db, collection, getDocs, query, orderBy } from './firebase';

/**
 * Aggregates all cluster data into a single portable JSON for migration to other providers.
 */
export const exportClusterData = async (): Promise<string> => {
  const collections = ['calls', 'leads', 'settings', 'contacts'];
  const exportBundle: Record<string, any> = {
    version: "1.0.4",
    exportedAt: new Date().toISOString(),
    clusterData: {}
  };

  for (const colName of collections) {
    try {
      const q = query(collection(db, colName));
      const snapshot = await getDocs(q);
      exportBundle.clusterData[colName] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (e) {
      console.warn(`Export: Skipping ${colName} (Empty or No Access)`);
      exportBundle.clusterData[colName] = [];
    }
  }

  return JSON.stringify(exportBundle, null, 2);
};

export const downloadJson = (jsonString: string, fileName: string) => {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
