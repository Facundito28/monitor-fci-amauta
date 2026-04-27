import React from 'react';

// Esta función consulta la API de CAFCI desde el servidor de Next.js
async function getTiposDeRenta() {
  try {
    const res = await fetch('https://api.pub.cafci.org.ar/tipo-renta', {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'origin': 'https://www.cafci.org.ar',
        'referer': 'https://www.cafci.org.ar/',
        'user-agent': 'Mozilla/5.0'
      },
      // Le decimos a Next.js que no guarde esto en caché de forma permanente
      cache: 'no-store' 
    });
    
    if (!res.ok) {
      throw new Error('Fallo al obtener los datos de CAFCI');
    }
    
    const json = await res.json();
    return json.data;
  } catch (error) {
    console.error("Error fetching CAFCI:", error);
    return [];
  }
}

export default async function FondosPage() {
  // Obtenemos los datos antes de renderizar la página
  const tiposDeRenta = await getTiposDeRenta();

  return (
    <div className="p-8 max-w-4xl mx-auto text-white">
      <h1 className="text-3xl font-bold mb-6">Monitor de FCIs</h1>
      
      <div className="bg-neutral-800 rounded-lg p-6 border border-neutral-700">
        <h2 className="text-xl font-semibold mb-4 text-gray-200">Tipos de Renta Disponibles</h2>
        
        {tiposDeRenta.length === 0 ? (
          <p className="text-red-400">Hubo un error al cargar los datos de la API de CAFCI.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tiposDeRenta.map((tipo: any) => (
              <li key={tipo.id} className="bg-neutral-900 border border-neutral-700 p-4 rounded-md shadow-sm flex items-center justify-between">
                <span className="font-medium">{tipo.nombre}</span>
                <span className="text-xs bg-neutral-700 px-2 py-1 rounded text-neutral-300">ID: {tipo.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
