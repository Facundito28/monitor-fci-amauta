import React from 'react';

// Función para obtener las categorías (Renta Fija, Variable, etc.)
async function getCategorias() {
  const res = await fetch('https://api.pub.cafci.org.ar/tipo-renta', {
    headers: { 'origin': 'https://www.cafci.org.ar', 'user-agent': 'Mozilla/5.0' },
    cache: 'no-store'
  });
  const json = await res.json();
  return json.data || [];
}

// Función para obtener los fondos (Buscador General)
async function getFondos(query = '', categoriaId = '') {
  // Construimos la URL con los filtros de la API de CAFCI
  let url = 'https://api.pub.cafci.org.ar/fondo?estado=1&include=entidad;gerente,tipoRenta,clase_fondo&limit=50&order=clase_fondos.nombre';
  
  const res = await fetch(url, {
    headers: { 'origin': 'https://www.cafci.org.ar', 'user-agent': 'Mozilla/5.0' },
    cache: 'no-store'
  });
  const json = await res.json();
  let fondos = json.data || [];

  // Filtramos manualmente para que sea más fácil para vos
  if (query) {
    fondos = fondos.filter((f: any) => f.nombre.toLowerCase().includes(query.toLowerCase()));
  }
  if (categoriaId) {
    fondos = fondos.filter((f: any) => String(f.tipoRentaId) === String(categoriaId));
  }
  
  return fondos;
}

export default async function CompararPage({
  searchParams,
}: {
  searchParams: { q?: string; cat?: string };
}) {
  // Leemos lo que el usuario escribe en la URL
  const query = searchParams.q || '';
  const catId = searchParams.cat || '';

  const [categorias, fondos] = await Promise.all([
    getCategorias(),
    getFondos(query, catId)
  ]);

  return (
    <div className="p-8 max-w-6xl mx-auto text-white">
      <h1 className="text-3xl font-bold mb-6">Comparador y Buscador</h1>

      {/* Barra de Filtros */}
      <form className="flex flex-wrap gap-4 mb-8 bg-neutral-800 p-4 rounded-lg border border-neutral-700">
        <div className="flex-1 min-w-[250px]">
          <label className="block text-xs uppercase text-gray-400 mb-1">Buscar por nombre</label>
          <input 
            name="q"
            defaultValue={query}
            placeholder="Ej: Ahorro Pesos..."
            className="w-full bg-neutral-900 border border-neutral-600 p-2 rounded text-white"
          />
        </div>

        <div className="w-full md:w-64">
          <label className="block text-xs uppercase text-gray-400 mb-1">Categoría</label>
          <select 
            name="cat" 
            defaultValue={catId}
            className="w-full bg-neutral-900 border border-neutral-600 p-2 rounded text-white"
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

      {/* Tabla de Resultados */}
      <div className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 text-gray-300">
            <tr>
              <th className="p-4">Fondo</th>
              <th className="p-4">Categoría</th>
              <th className="p-4">Gerente</th>
              <th className="p-4 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {fondos.length > 0 ? fondos.map((fondo: any) => (
              <tr key={fondo.id} className="border-b border-neutral-700 hover:bg-neutral-700/50">
