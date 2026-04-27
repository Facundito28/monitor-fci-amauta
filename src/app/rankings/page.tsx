import React from 'react';

// Consulta el Buscador de Fondos de CAFCI
async function getTodosLosFondos() {
  try {
    // Usamos el endpoint de listado general de fondos
    const res = await fetch('https://api.pub.cafci.org.ar/fondo?estado=1&include=entidad;depositaria,entidad;gerente,tipoRenta,tipoRentaMixta,region,benchmark,horizonte,duration,tipo_fondo,clase_fondo&limit=20&order=clase_fondos.nombre', {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'origin': 'https://www.cafci.org.ar',
        'referer': 'https://www.cafci.org.ar/',
        'user-agent': 'Mozilla/5.0'
      },
      cache: 'no-store'
    });
    
    if (!res.ok) throw new Error('Fallo al obtener fondos');
    const json = await res.json();
    return json.data;
  } catch (error) {
    console.error("Error fetching CAFCI:", error);
    return [];
  }
}

export default async function RankingsPage() {
  const fondos = await getTodosLosFondos();

  return (
    <div className="p-8 max-w-6xl mx-auto text-white">
      <h1 className="text-3xl font-bold mb-2">Buscador General de Fondos</h1>
      <p className="text-gray-400 mb-6">Acá podés ver la lista de fondos y su categoría.</p>
      
      <div className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 border-b border-neutral-700">
            <tr>
              <th className="p-4 font-semibold text-gray-200">Nombre del Fondo</th>
              <th className="p-4 font-semibold text-gray-200">Tipo de Renta</th>
              <th className="p-4 font-semibold text-gray-200">Sociedad Gerente</th>
            </tr>
          </thead>
          <tbody>
            {fondos.map((fondo: any) => (
              <tr key={fondo.id} className="border-b border-neutral-700/50 hover:bg-neutral-700/30">
                <td className="p-4 font-medium text-blue-400">{fondo.nombre}</td>
                <td className="p-4 text-gray-300">{fondo.tipoRenta?.nombre || 'N/A'}</td>
                <td className="p-4 text-gray-400">{fondo.entidadGerente?.nombreCorto || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
