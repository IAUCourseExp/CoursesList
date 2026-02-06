import VirtualTable from './components/VirtualTable';
import { useState, useEffect, useMemo } from 'react';
  
function App() {
  // ---------------------------------------------------------
  // تاریخ آخرین آپدیت را اینجا تغییر دهید:
  const LAST_UPDATE = "17 بهمن 1404"; 
  // ---------------------------------------------------------
  
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ column: null, direction: 'asc' });
    
  const worker = useMemo(() => 
    new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), 
  []);
  
  useEffect(() => {
    worker.postMessage({ type: 'LOAD_CSV' });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'DATA_LOADED') {
        setData(payload.data || []);
        setColumns(payload.columns || []);
        setIsLoading(false);
      } else if (type === 'SEARCH_RESULTS') {
        setData(payload.payload || []); 
        setIsLoading(false);
      }
    };
    return () => worker.terminate();
  }, [worker]);
   
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);


  useEffect(() => {
    if (debouncedTerm.trim() !== "") {
      setIsLoading(true);
      worker.postMessage({ type: 'SEARCH', payload: debouncedTerm });
    }
  }, [debouncedTerm, worker]);
 
  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

const handleSort = (columnName) => {
  let direction = 'asc';
  if (sortConfig.column === columnName && sortConfig.direction === 'asc') {
    direction = 'desc';
  }
  
  setSortConfig({ column: columnName, direction });
  setIsLoading(true);
  worker.postMessage({ type: 'SORT', payload: { column: columnName, direction } });
};

  return (
    <div className="h-screen bg-gray-50 w-full font-vazir overflow-hidden flex flex-col">
      
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-gray-200 pb-4 pt-4 shadow-sm">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            
            <div className="flex flex-col items-center md:items-start flex-1 text-center md:text-right">
              <h1 className="text-2xl font-black text-blue-900 mb-1">لیست دروس دانشگاه آزاد شیراز</h1>
              
              <a 
                href="/data.csv"
                download={`لیست_دروس_${LAST_UPDATE.replace(/ /g, '_')}.csv`}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-all shadow-md hover:shadow-green-200"
              >
                <span>📥</span>
                دانلود لیست کامل (آپدیت {LAST_UPDATE})
              </a>

              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 w-full max-w-md mt-2">
                <div className="flex justify-between items-center mb-2 border-b border-blue-100 pb-1">
                  <h5 className="text-[10px] sm:text-xs font-bold text-blue-800 flex items-center gap-1">
                    <span>📢</span> کانال‌های مرتبط
                  </h5>
                  <span className="text-[9px] sm:text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                    🔄 آخرین بروزرسانی: {LAST_UPDATE}
                  </span>
                </div>
                
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] sm:text-xs text-right">
                  <li className="flex items-center gap-1">
                    <span className="opacity-70">📚</span>
                    <span className="font-medium">جزوه:</span>
                    <a href="https://t.me/JozveIAU" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" className="w-3 h-3" alt="TG" /> JozveIAU
                    </a>
                  </li>
                  <li className="flex items-center gap-1">
                    <span className="opacity-70">⁉️</span>
                    <span className="font-medium">تجربیات:</span>
                    <a href="https://t.me/IAUCourseExp" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" className="w-3 h-3" alt="TG" /> IAUCourseExp
                    </a>
                  </li>
                  <li className="flex items-center gap-1 sm:col-span-2">
                    <span className="opacity-70">💻</span>
                    <span className="font-medium">انجمن کامپیوتر:</span>
                    <a href="https://t.me/shziaucesa" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" className="w-3 h-3" alt="TG" /> shziaucesa
                    </a>
                  </li>
                </ul>
              </div>
            </div>
 
            <div className="w-full max-w-md relative group">
              <input
                id="search-courses"
                type="text"
                placeholder="نام درس، استاد یا روز را جستجو کنید..."
                className="w-full px-5 py-3 bg-white shadow-lg rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none transition-all pr-12 text-md text-right shadow-blue-100"
                value={searchTerm}
                onChange={handleSearch}
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-lg">
                🔍
              </div>
            </div>
 
          </div>
        </div>
      </header>
   
      <div className="w-full px-2 md:px-4 mt-4">
        <main className="bg-white shadow-2xl rounded-3xl overflow-hidden w-full border border-gray-200">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-40">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600"></div>
              <p className="mt-6 text-gray-500 text-lg animate-pulse text-center">در حال بارگذاری لیست دروس...</p>
            </div>
          ) : (
            <VirtualTable data={data} columns={columns} onSort={handleSort} sortConfig={sortConfig} />
          )}
        </main>

        <footer className="py-4 text-center text-red-600 font-bold text-[11px] animate-pulse">
          تعداد کل ردیف‌ها: {data.length.toLocaleString()} | طراحی شده برای دانشجویان آزاد شیراز
        </footer>
      </div>
    </div>
  );
}
  
export default App;