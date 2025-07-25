import React from 'react'

export default function GalleryFilters({
  year,
  setYear,
  month,
  setMonth,
  searchTerm,
  setSearchTerm,
  years,
  monthNames,
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-4 justify-center">
      <div className="w-full md:w-1/3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar fotos..."
          className="p-2 border border-gray-300 rounded w-full dark:bg-gray-800"
        />
      </div>
      <div className="flex items-center">
        {/* eslint-disable-next-line jsx-a11y/no-onchange */}
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="p-2 pr-6 w-20 border border-gray-300 rounded dark:bg-gray-800"
        >
          <option value="" disabled hidden>
            Año
          </option>
          {years.map((yr) => (
            <option key={yr} value={yr.toString()}>
              {yr}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center">
        {/* eslint-disable-next-line jsx-a11y/no-onchange */}
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="p-2 pr-6 w-20 border border-gray-300 rounded dark:bg-gray-800"
        >
          {month && month !== 'all' && (
            <option value={month} hidden>
              {`${monthNames[parseInt(month, 10)].slice(0, 3)}.`}
            </option>
          )}
          <option value="" disabled hidden>
            Mes
          </option>
          <option value="all">All</option>
          {monthNames.slice(1).map((m, idx) => (
            <option key={idx + 1} value={(idx + 1).toString()}>
              {m}
            </option>
          ))}
        </select>
        {month && (
          <button
            onClick={() => setMonth('')}
            className="ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Clear month filter"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  )
}
