INSERT INTO public.fci_categoria (id, nombre, codigo_cafci) VALUES
  (1, '<Sin Asignar>', 'SAsig'),
  (2, 'Renta Variable', 'RV'),
  (3, 'Renta Fija', 'RF'),
  (4, 'Mercado de Dinero', 'DD'),
  (5, 'Renta Mixta', 'FM'),
  (6, 'PyMes', 'FP'),
  (7, 'Retorno Total', 'TR'),
  (8, 'Infraestructura', 'FI'),
  (9, 'Fondos Cerrados', 'F'),
  (10, 'ASG', 'ASG')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  codigo_cafci = EXCLUDED.codigo_cafci;
