/**
 * Prisma Seed - Producción (Mínimo)
 * Datos mínimos necesarios para desplegar el aplicativo
 * El usuario configura todo lo demás desde el panel
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('SEED DE PRODUCCION - TRANSPORTE HERMINIO');
  console.log('='.repeat(60));

  // ==========================================================================
  // 1. ROLES
  // ==========================================================================
  console.log('\n[1/7] Creando roles...');

  const rolesData = [
    { nombre: 'PUNTO_VENTA' },
    { nombre: 'ALMACEN' },
    { nombre: 'SUPER_ADMIN' },
    { nombre: 'ADMINISTRADOR' }
  ];

  for (const rol of rolesData) {
    await prisma.rol.upsert({
      where: { nombre: rol.nombre },
      update: {},
      create: { nombre: rol.nombre, estado: 1 }
    });
  }
  console.log(`   ✓ ${rolesData.length} roles creados`);

  // ==========================================================================
  // 2. PERMISOS
  // ==========================================================================
  console.log('\n[2/7] Creando permisos...');

  const permisosData = [
    // Puntos
    { codigo: 'PUNTOS_LISTAR', nombre: 'Listar puntos', tipo: 'MENU', recurso: 'puntos' },
    { codigo: 'PUNTOS_CREAR', nombre: 'Crear punto', tipo: 'ACCION', recurso: 'puntos' },
    { codigo: 'PUNTOS_EDITAR', nombre: 'Editar punto', tipo: 'ACCION', recurso: 'puntos' },
    { codigo: 'PUNTOS_ELIMINAR', nombre: 'Eliminar punto', tipo: 'ACCION', recurso: 'puntos' },
    // Rutas
    { codigo: 'RUTAS_LISTAR', nombre: 'Listar rutas', tipo: 'MENU', recurso: 'rutas' },
    { codigo: 'RUTAS_CREAR', nombre: 'Crear ruta', tipo: 'ACCION', recurso: 'rutas' },
    { codigo: 'RUTAS_EDITAR', nombre: 'Editar ruta', tipo: 'ACCION', recurso: 'rutas' },
    { codigo: 'RUTAS_ELIMINAR', nombre: 'Eliminar ruta', tipo: 'ACCION', recurso: 'rutas' },
    // Horarios
    { codigo: 'HORARIOS_LISTAR', nombre: 'Listar horarios', tipo: 'MENU', recurso: 'horarios' },
    { codigo: 'HORARIOS_CREAR', nombre: 'Crear horario', tipo: 'ACCION', recurso: 'horarios' },
    { codigo: 'HORARIOS_EDITAR', nombre: 'Editar horario', tipo: 'ACCION', recurso: 'horarios' },
    { codigo: 'HORARIOS_HABILITAR', nombre: 'Habilitar/deshabilitar horario', tipo: 'ACCION', recurso: 'horarios' },
    // Pasajes
    { codigo: 'PASAJES_VENDER', nombre: 'Vender pasaje', tipo: 'ACCION', recurso: 'pasajes' },
    { codigo: 'PASAJES_LISTAR', nombre: 'Listar pasajes', tipo: 'MENU', recurso: 'pasajes' },
    { codigo: 'PASAJES_ANULAR', nombre: 'Anular pasaje', tipo: 'ACCION', recurso: 'pasajes' },
    { codigo: 'PASAJES_REIMPRIMIR', nombre: 'Reimprimir pasaje', tipo: 'ACCION', recurso: 'pasajes' },
    // Encomiendas
    { codigo: 'ENCOMIENDAS_REGISTRAR', nombre: 'Registrar encomienda', tipo: 'ACCION', recurso: 'encomiendas' },
    { codigo: 'ENCOMIENDAS_LISTAR', nombre: 'Listar encomiendas', tipo: 'MENU', recurso: 'encomiendas' },
    { codigo: 'ENCOMIENDAS_ESCANEAR', nombre: 'Escanear QR encomienda', tipo: 'ACCION', recurso: 'encomiendas' },
    { codigo: 'ENCOMIENDAS_CAMBIAR_ESTADO', nombre: 'Cambiar estado encomienda', tipo: 'ACCION', recurso: 'encomiendas' },
    { codigo: 'ENCOMIENDAS_RETIRAR', nombre: 'Registrar retiro encomienda', tipo: 'ACCION', recurso: 'encomiendas' },
    // Dashboard
    { codigo: 'DASHBOARD_VER', nombre: 'Ver dashboard', tipo: 'MENU', recurso: 'dashboard' },
    // Usuarios
    { codigo: 'USUARIOS_LISTAR', nombre: 'Listar usuarios', tipo: 'MENU', recurso: 'usuarios' },
    { codigo: 'USUARIOS_CREAR', nombre: 'Crear usuario', tipo: 'ACCION', recurso: 'usuarios' },
    { codigo: 'USUARIOS_EDITAR', nombre: 'Editar usuario', tipo: 'ACCION', recurso: 'usuarios' },
    // Clientes
    { codigo: 'CLIENTES_CREAR', nombre: 'Crear Cliente', tipo: 'ACCION', recurso: 'clientes' },
    { codigo: 'CLIENTES_EDITAR', nombre: 'Editar Cliente', tipo: 'ACCION', recurso: 'clientes' },
    { codigo: 'CLIENTES_ELIMINAR', nombre: 'Eliminar Cliente', tipo: 'ACCION', recurso: 'clientes' },
    { codigo: 'CLIENTES_VER_HISTORIAL', nombre: 'Ver historial de cliente', tipo: 'ACCION', recurso: 'clientes' },
    { codigo: 'CLIENTES_LISTAR', nombre: 'Listar Clientes', tipo: 'MENU', recurso: 'clientes' },
    // Facturacion
    { codigo: 'FACTURACION_VER', nombre: 'Ver modulo de facturacion', tipo: 'MENU', recurso: 'facturacion' },
    { codigo: 'FACTURACION_EMITIR', nombre: 'Emitir comprobantes', tipo: 'ACCION', recurso: 'facturacion' },
    { codigo: 'FACTURACION_ANULAR', nombre: 'Anular comprobantes', tipo: 'ACCION', recurso: 'facturacion' },
    { codigo: 'FACTURACION_CONFIG', nombre: 'Configurar facturacion', tipo: 'ACCION', recurso: 'facturacion' },
    { codigo: 'GUIA_REMISION_EMITIR', nombre: 'Emitir guias de remision', tipo: 'ACCION', recurso: 'facturacion' },
    // Landing y Banners
    { codigo: 'LANDING_VER', nombre: 'Ver Landing', tipo: 'MENU', recurso: 'LANDING' },
    { codigo: 'LANDING_EDITAR', nombre: 'Editar Landing', tipo: 'ACCION', recurso: 'LANDING' },
    { codigo: 'BANNERS_VER', nombre: 'Ver Banners', tipo: 'MENU', recurso: 'BANNERS' },
    { codigo: 'BANNERS_CREAR', nombre: 'Crear Banners', tipo: 'ACCION', recurso: 'BANNERS' },
    { codigo: 'BANNERS_EDITAR', nombre: 'Editar Banners', tipo: 'ACCION', recurso: 'BANNERS' },
    { codigo: 'BANNERS_ELIMINAR', nombre: 'Eliminar Banners', tipo: 'ACCION', recurso: 'BANNERS' }
  ];

  const permisosCreados = [];
  for (const p of permisosData) {
    const permiso = await prisma.permiso.upsert({
      where: { codigo: p.codigo },
      update: { nombre: p.nombre, tipo: p.tipo, recurso: p.recurso },
      create: { ...p, estado: 1 }
    });
    permisosCreados.push(permiso);
  }
  console.log(`   ✓ ${permisosCreados.length} permisos creados`);

  // ==========================================================================
  // 3. ROLES-PERMISOS
  // ==========================================================================
  console.log('\n[3/7] Asignando permisos a roles...');

  const roles = await prisma.rol.findMany();
  const getRolId = (nombre) => roles.find(r => r.nombre === nombre)?.id;
  const getPermisoId = (codigo) => permisosCreados.find(p => p.codigo === codigo)?.id;

  // SUPER_ADMIN: Todos los permisos
  const superAdminId = getRolId('SUPER_ADMIN');
  for (const permiso of permisosCreados) {
    await prisma.rolPermiso.upsert({
      where: { idRol_idPermiso: { idRol: superAdminId, idPermiso: permiso.id } },
      update: {},
      create: { idRol: superAdminId, idPermiso: permiso.id, estado: 1 }
    });
  }

  // ADMINISTRADOR
  const adminId = getRolId('ADMINISTRADOR');
  const permisosAdmin = [
    'RUTAS_LISTAR', 'HORARIOS_LISTAR', 'HORARIOS_CREAR', 'HORARIOS_EDITAR',
    'HORARIOS_HABILITAR', 'PASAJES_LISTAR', 'PASAJES_ANULAR', 'CLIENTES_LISTAR',
    'CLIENTES_VER_HISTORIAL', 'FACTURACION_VER'
  ];
  for (const codigo of permisosAdmin) {
    const permisoId = getPermisoId(codigo);
    if (permisoId) {
      await prisma.rolPermiso.upsert({
        where: { idRol_idPermiso: { idRol: adminId, idPermiso: permisoId } },
        update: {},
        create: { idRol: adminId, idPermiso: permisoId, estado: 1 }
      });
    }
  }

  // PUNTO_VENTA
  const pvId = getRolId('PUNTO_VENTA');
  const permisosPV = [
    'HORARIOS_LISTAR', 'PASAJES_VENDER', 'PASAJES_LISTAR', 'PASAJES_ANULAR',
    'PASAJES_REIMPRIMIR', 'ENCOMIENDAS_REGISTRAR', 'ENCOMIENDAS_LISTAR',
    'ENCOMIENDAS_ESCANEAR', 'ENCOMIENDAS_CAMBIAR_ESTADO', 'ENCOMIENDAS_RETIRAR',
    'CLIENTES_CREAR', 'CLIENTES_EDITAR', 'CLIENTES_VER_HISTORIAL', 'CLIENTES_LISTAR',
    'FACTURACION_VER', 'FACTURACION_EMITIR'
  ];
  for (const codigo of permisosPV) {
    const permisoId = getPermisoId(codigo);
    if (permisoId) {
      await prisma.rolPermiso.upsert({
        where: { idRol_idPermiso: { idRol: pvId, idPermiso: permisoId } },
        update: {},
        create: { idRol: pvId, idPermiso: permisoId, estado: 1 }
      });
    }
  }

  // ALMACEN
  const almacenId = getRolId('ALMACEN');
  const permisosAlmacen = [
    'ENCOMIENDAS_LISTAR', 'ENCOMIENDAS_ESCANEAR', 'ENCOMIENDAS_CAMBIAR_ESTADO',
    'ENCOMIENDAS_RETIRAR'
  ];
  for (const codigo of permisosAlmacen) {
    const permisoId = getPermisoId(codigo);
    if (permisoId) {
      await prisma.rolPermiso.upsert({
        where: { idRol_idPermiso: { idRol: almacenId, idPermiso: permisoId } },
        update: {},
        create: { idRol: almacenId, idPermiso: permisoId, estado: 1 }
      });
    }
  }

  const totalRolesPermisos = await prisma.rolPermiso.count();
  console.log(`   ✓ ${totalRolesPermisos} asignaciones rol-permiso creadas`);

  // ==========================================================================
  // 4. USUARIO SUPER ADMIN
  // ==========================================================================
  console.log('\n[4/7] Creando usuario Super Admin...');

  const passwordHash = await bcrypt.hash('123456', 10);

  await prisma.usuario.upsert({
    where: { correo: 'admin@transporte.com' },
    update: {},
    create: {
      nombres: 'Super Administrador',
      correo: 'admin@transporte.com',
      contrasena: passwordHash,
      idRol: superAdminId,
      idPunto: null,
      estado: 1
    }
  });
  console.log('   ✓ Usuario admin@transporte.com creado');

  // ==========================================================================
  // 5. CONFIGURACION DEL SISTEMA
  // ==========================================================================
  console.log('\n[5/7] Creando configuracion del sistema...');

  await prisma.tbl_configuracion_sistema.updateMany({
    data: { activo: false }
  });

  await prisma.tbl_configuracion_sistema.create({
    data: {
      nombre_empresa: 'CRUZ SELVATICO',
      ruc: '20600812727',
      direccion: 'Cal. Ingobert Witting Nro. 270',
      telefono: '991075959',
      precio_base_pasaje: 30.00,
      precio_base_encomienda_kg: 5.00,
      tiempo_reserva_minutos: 65,
      capacidad_default_bus: 40,
      activo: true,
      soles_por_punto: 10.00,
      puntos_por_sol_descuento: 1.00,
      politicas_encomienda: `El remitente sera responsable de la veracidad de los datos brindados.
La empresa no se responsabiliza por deterioro debido al mal embalado ni por descomposicion de articulos susceptibles.
Plazo para retirar su encomienda: 48 horas desde que llego. Caso contrario sera evacuado al almacen por 15 dias (si es perecible 3 dias). Se dara por abandono y sera desechable sin lugar a reclamo.
Todo producto ilegal o prohibido sera puesto a disposicion de las autoridades competentes.
El pago por perdida de un envio se hara de acuerdo a la ley de ferrocarriles (art. 8): diez veces el valor del flete pagado.
La clave de seguridad es personal y privada para el recojo de sus envios.
Recibido sin verificacion de contenido.`,
      slogan: 'Viaja seguro, envia confiado',
      tiempo_rotacion_banner: 5
    }
  });
  console.log('   ✓ Configuracion del sistema creada');

  // ==========================================================================
  // 6. CONFIGURACION SUNAT (KeyFacil) - PRODUCCION
  // ==========================================================================
  console.log('\n[6/7] Creando configuracion SUNAT (KeyFacil)...');

  const existingConfig = await prisma.tbl_configuracion_sunat.findFirst();
  if (!existingConfig) {
    await prisma.tbl_configuracion_sunat.create({
      data: {
        ruc_emisor: '20600812727',
        razon_social: 'EMPRESA DE TURISMO & SERVICIOS MULTIPLES CRUZ SELVATICO S.A.C.',
        nombre_comercial: 'Cruz Selvatico',
        direccion_fiscal: 'Cal. Ingobert Witting Nro. 270',
        ubigeo: '190303',
        departamento: 'PASCO',
        provincia: 'OXAPAMPA',
        distrito: 'POZUZO',
        keyfacil_token: '71482384-59a4-48ab-b804-306ed7ac070b',
        keyfacil_url: 'https://api.vitekey.com/keyfact/integra/v1',
        modo_produccion: true,
        igv_porcentaje: 18.00,
        activo: true
      }
    });
    console.log('   ✓ Configuracion SUNAT creada (MODO PRODUCCION)');
  } else {
    console.log('   ✓ Configuracion SUNAT ya existe');
  }

  // ==========================================================================
  // 7. SERIES DE FACTURACION
  // ==========================================================================
  console.log('\n[7/7] Creando series de facturacion...');

  const seriesData = [
    { tipo_comprobante: '03', serie: 'BT74', numero_actual: 0, activo: true },  // Boleta
    { tipo_comprobante: '01', serie: 'FT74', numero_actual: 0, activo: true },  // Factura
    { tipo_comprobante: 'NV', serie: 'NV01', numero_actual: 0, activo: true },  // Nota de Venta
    { tipo_comprobante: '09', serie: 'TZ74', numero_actual: 0, activo: true }   // Guia de Remision
  ];

  for (const s of seriesData) {
    const existing = await prisma.tbl_series_factura.findFirst({
      where: { tipo_comprobante: s.tipo_comprobante, serie: s.serie }
    });
    if (!existing) {
      await prisma.tbl_series_factura.create({ data: s });
    }
  }
  console.log(`   ✓ ${seriesData.length} series de facturacion creadas`);

  // ==========================================================================
  // RESUMEN
  // ==========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('SEED COMPLETADO EXITOSAMENTE');
  console.log('='.repeat(60));
  console.log('\nCREDENCIALES DE ACCESO:');
  console.log('  Email:    admin@transporte.com');
  console.log('  Password: 123456');
  console.log('\nCONFIGURACION KEYFACIL:');
  console.log('  RUC:      20600812727');
  console.log('  Token:    71482384-59a4-48ab-b804-306ed7ac070b');
  console.log('  Modo:     PRODUCCION');
  console.log('\nPASOS SIGUIENTES (desde el panel de admin):');
  console.log('  1. Crear Tipos de Carro (Bus, Minivan, etc.)');
  console.log('  2. Crear Tipos de Paquete (Sobre, Caja, Bulto)');
  console.log('  3. Configurar Precios de Encomienda');
  console.log('  4. Crear Puntos (agencias/terminales)');
  console.log('  5. Crear Rutas entre puntos');
  console.log('  6. Crear Horarios para las rutas');
  console.log('  7. Crear usuarios adicionales');
  console.log('='.repeat(60));
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
