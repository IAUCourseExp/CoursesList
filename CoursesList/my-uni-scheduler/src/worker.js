import Papa from 'papaparse';

let cachedData = [];


self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'LOAD_CSV') {
    try {
      const response = await fetch('/data.csv');

      const csvString = await response.text(); 

      Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          cachedData = results.data;
          self.postMessage({
            type: 'DATA_LOADED',
            payload: {
              data: cachedData,
              columns: results.meta.fields
            }
          });
        }
      });
    } catch (error) {
      console.error('خطا در بارگذاری:', error);
    }
  }

  if (type === 'SEARCH') {
    const searchTerm = payload.toLowerCase();
    
    if (!searchTerm) {

      self.postMessage({ type: 'SEARCH_RESULTS', payload: { payload: cachedData } });
      return;
    }

    const filtered = cachedData.filter(row => 
      Object.values(row).some(value => 
        String(value).toLowerCase().includes(searchTerm)
      )
    );


    self.postMessage({ type: 'SEARCH_RESULTS', payload: { payload: filtered } });
  }

  if (type === 'SORT') {
    const { column, direction } = payload;
    

    const sortedData = [...cachedData].sort((a, b) => {
      let valA = a[column] || "";
      let valB = b[column] || "";


      const isNumA = !isNaN(parseFloat(valA)) && isFinite(valA);
      const isNumB = !isNaN(parseFloat(valB)) && isFinite(valB);

      if (isNumA && isNumB) {

        return direction === 'asc' ? valA - valB : valB - valA;
      } else {

        return direction === 'asc' 
          ? String(valA).localeCompare(String(valB), 'fa')
          : String(valB).localeCompare(String(valA), 'fa');
      }
    });


    self.postMessage({ type: 'SEARCH_RESULTS', payload: { payload: sortedData } });
  }
};