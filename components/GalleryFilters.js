import React from 'react'

export default function GalleryFilters({ year, setYear, searchTerm, setSearchTerm, years }) {
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
        {}
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
    </div>
  )
}
