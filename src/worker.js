import Papa from 'papaparse';

let cachedData = [];


self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'LOAD_CSV') {
    try {
      // استفاده از آدرسی که از سمت App.jsx فرستاده شده است
      // اگر آدرسی نبود، به عنوان رزرو از '/data.csv' استفاده می‌کند
      const fileUrl = e.data.url || '/data.csv'; 
      
      const response = await fetch(fileUrl);

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
    const query = payload.trim();
    
    // تابعی برای یکسان‌سازی حروف فارسی (ی و ک)
    const normalizeFarsi = (text) => {
      if (!text) return "";
      return String(text)
        .replace(/ی/g, "ی").replace(/ي/g, "ی") // یکسان‌سازی ی
        .replace(/ک/g, "ک").replace(/ك/g, "ک") // یکسان‌سازی ک
        .toLowerCase();
    };

    const normalizedQuery = normalizeFarsi(query);

    const results = cachedData.filter(row => {
      return Object.values(row).some(value => {
        const normalizedValue = normalizeFarsi(value);
        return normalizedValue.includes(normalizedQuery);
      });
    });

    self.postMessage({
      type: 'SEARCH_RESULTS',
      payload: { payload: results }
    });
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