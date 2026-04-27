import React from 'react';

// Función segura para obtener categorías
async function getCategorias() {
  try {
    const res = await fetch('https://api.pub.cafci.org.ar/tipo-renta', {
      headers: { 'origin': 'https://www.cafci.org.ar', 'user-agent': 'Mozilla/5.0' },
      cache: 'no-store'
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (error) {
    return [];
  }
}

// Función segura para obtener TODOS los fondos
async function getFondos(query = '', categoriaId = '') {
  try {
    // Usamos limit=0 para traer toda la base como pide la documentación
    let url = 'https://api.pub.cafci.org.ar/fondo?estado=1&include=entidad;gerente,tipoRenta,clase_fondo&limit=0&order=clase_fondos.nombre';
    
    const res = await fetch(url, {
      headers: { 'origin': 'https://www.cafci.org.ar', 'user-agent': 'Mozilla/5.0' },
      cache: 'no-store'
    });
    
    if (!res.ok) return [];
    
    const json = await res.json();
    let fondos = json.data || [];

    // Filtros
    if (query) {
      fondos = fondos.filter((f: any) => 
        f.nombre && f.nombre.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    if (categoriaId) {
      // IMPORTANTE: tipoRentaId es un string en la API de CAFCI ("4"), hay que compararlo como string
      fondos = fondos.filter((f: any) => String(f.tipoRentaId) === String(categoriaId));
    }
    
    return fondos;
  } catch (error) {
    return [];
  }
}

export default async function CompararPage({
  searchParams,
}: {
  searchParams: { q?: string; cat?: string };
}) {
  const query = searchParams.q || '';
  const catId = searchParams.cat || '';

  const [categorias, fondos] = await Promise.all([
    getCategorias(),
    getFondos(query, catId)
  ]);

  return (
    <div className="p-8 max-w-6xl mx-auto text-white">
      <h1 className="text-3xl font-bold mb-6">Comparador y Buscador</h1>

      <form className="flex flex-wrap gap-4 mb-8 bg-neutral-800 p-4 rounded-lg border border-neutral-700">
        <div className="flex-1 min-w-[250px]">
          <label className="block text-xs uppercase text-gray-400 mb-1">Buscar por nombre</label>
          <input 
            name="q"
            defaultValue={query}
            placeholder="Ej: Ahorro Pesos..."
            className="w-full bg-neutral-900 border border-neutral-600 p-2 rounded text-white outline-none focus:border-blue-500"
          />
        </div>

        <div className="w-full md:w-64">
          <label className="block text-xs uppercase text-gray-400 mb-1">Categoría</label>
          <select 
            name="cat" 
            defaultValue={catId}
            className="w-full bg-neutral-900 border border-neutral-600 p-2 rounded text-white outline-none focus:border-blue-500"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((cat: any) => (
              <option key={cat.id} value={cat.id}>{cat.nombre}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="self-end bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded font-bold transition">
          Filtrar
        </button>
      </form>

      <div className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 text-gray-300 border-b border-neutral-700">
            <tr>
              <th className="p-4">Fondo</th>
              <th className="p-4">Categoría</th>
              <th className="p-4">Gerente</th>
              <th className="p-4 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {fondos.length > 0 ? fondos.map((fondo: any) => (
              <tr key={fondo.id} className="border-b border-neutral-700/50 hover:bg-neutral-700/30">
                <td className="p-4 font-bold text-blue-400">{fondo.nombre}</td>
                <td className="p-4">{fondo.tipoRenta?.nombre || 'N/A'}</td>
                <td className="p-4 text-gray-400">{fondo.entidadGerente?.nombreCorto || 'N/A'}</td>
                <td className="p-4 text-right">
                  <button className="text-xs bg-neutral-600 hover:bg-neutral-500 transition px-2 py-1 rounded">Comparar</button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={4} className="p-10 text-center text-gray-500">No se encontraron fondos con esos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
