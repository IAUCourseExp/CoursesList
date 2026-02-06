import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const VirtualTable = ({ data, columns, onSort, sortConfig }) => {
  const parentRef = useRef();

  const getColWidth = (colName) => {
    if (colName === 'نام درس') return 300;
    if (colName === 'زمانبندي تشکيل کلاس') return 400;
    if (colName === 'مكان برگزاري') return 350;
    if (colName === 'استاد') return 220;
    if (colName === 'دانشجويان مجاز به اخذ کلاس') return 300;
    
    if (colName === 'كد درس') return 120;
    if (colName === 'كد ارائه کلاس درس') return 140;
    if (colName === 'تعداد واحد نظري') return 100;
    if (colName === 'تعداد واحد عملي') return 100;
    if (colName === 'حداكثر ظرفيت') return 100;
    if (colName === 'تعداد ثبت نامي تاکنون') return 120;

    if (colName === 'نوع درس') return 130;
    if (colName === 'نام كلاس درس') return 200;
    if (colName === 'ساير اساتيد') return 200;
    if (colName === 'زمان امتحان') return 200;
    if (colName === 'مقطع ارائه درس') return 150;
    if (colName === 'نوع ارائه') return 120;
    if (colName === 'سطح ارائه') return 120;
    if (colName === 'گروه آموزشی') return 200;
    if (colName === 'دانشکده') return 200;
    if (colName === 'واحد') return 150;
    if (colName === 'استان') return 120;

    return 180;
  };

  const minTableWidth = columns.reduce((acc, col) => acc + getColWidth(col), 0);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 10,
  });

  const lastScrollLeft = useRef(0);
  const isFirstLoad = useRef(true);

  const handleScroll = (e) => {
    lastScrollLeft.current = e.target.scrollLeft;
  };

  useLayoutEffect(() => {
    if (parentRef.current) {
      if (isFirstLoad.current && data.length > 0) {
        const maxScroll = parentRef.current.scrollWidth - parentRef.current.clientWidth;
        parentRef.current.scrollLeft = maxScroll;
        lastScrollLeft.current = maxScroll;
        isFirstLoad.current = false;
      } else if (!isFirstLoad.current) {
        parentRef.current.scrollLeft = lastScrollLeft.current;
      }
    }
  }, [data]);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-300 shadow-2xl">
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="h-[calc(100vh-250px)] w-full overflow-auto bg-white custom-scrollbar"
        style={{ direction: 'ltr' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            minWidth: `${minTableWidth}px`,
            position: 'relative',
            direction: 'rtl',
          }}
        >
          <div className="sticky top-0 z-20 flex bg-slate-800 text-white shadow-lg w-full">
            {columns.map((col) => (
              <div
                key={col}
                onClick={() => onSort(col)}
                style={{ 
                  width: `${getColWidth(col)}px`,
                  flexGrow: 1, 
                  flexShrink: 0,
                  cursor: 'pointer' 
                }}
                className="p-4 text-center text-sm font-bold border-l border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-all select-none group"
              >
                <div className="flex flex-row-reverse items-center gap-2 justify-center w-full">
                  
                  <div className="flex flex-col items-center justify-center min-w-[14px]">
                    {sortConfig.column === col ? (
                      <span className="text-blue-400 text-base animate-pulse">
                        {sortConfig.direction === 'asc' ? '▴' : '▾'}
                      </span>
                    ) : (
                      <div className="flex flex-col -space-y-1 opacity-30 group-hover:opacity-90 transition-opacity">
                        <span className="text-[20px]">▴</span>
                        <span className="text-[20px]">▾</span>
                      </div>
                    )}
                  </div>

                  <span className="break-words leading-tight">{col}</span>

                </div>
              </div>
            ))}
          </div>

          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = data[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                className={`absolute top-0 left-0 w-full border-b border-gray-200 flex items-center transition-colors duration-200
                  ${virtualRow.index % 2 === 0 ? 'bg-white' : 'bg-slate-100'} 
                  hover:bg-blue-100`}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {columns.map((col) => (
                  <div
                    key={col}
                    style={{ 
                      width: `${getColWidth(col)}px`,
                      flexGrow: 1,
                      flexShrink: 0 
                    }}
                    className="px-4 py-2 text-sm text-slate-600 font-medium flex items-center justify-center text-center border-l border-gray-50 last:border-l-0 overflow-hidden"
                  >
                    <span className="break-words w-full leading-relaxed block overflow-hidden whitespace-normal">
                      {row[col] || "---"}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
 
export default VirtualTable;