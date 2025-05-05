import { pool } from './connectDB.js';
import { logMensaje } from './utils/logs.js';

export const guardarDetallesEnBD = async (d) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT estado FROM licitaciones WHERE codigo_externo = ?',
      [d.CodigoExterno]
    );

    const yaExiste = rows.length > 0;
    const estadoExistente = yaExiste ? rows[0].estado : null;

    if (yaExiste) {
      if (estadoExistente === 'Publicada' && d.Estado === 'Publicada') {
        await conn.rollback();
        return;
      }
      if (estadoExistente !== d.Estado) {
        logMensaje(`🔄 Cambio de estado para ${d.CodigoExterno}: '${estadoExistente}' → '${d.Estado}'`, 'info');
      }
    }

    const f = d.Fechas || {};

    await conn.query(`
      INSERT INTO licitaciones (
        codigo_externo, nombre, codigo_estado, estado, descripcion,
        dias_cierre, informada, codigo_tipo, tipo, tipo_convocatoria,
        moneda, etapas, estado_etapas, toma_razon, estado_publicidad_ofertas,
        justificacion_publicidad, contrato, obras, cantidad_reclamos,
        unidad_tiempo_evaluacion, direccion_visita, direccion_entrega,
        estimacion, fuente_financiamiento, visibilidad_monto, monto_estimado,
        tiempo, unidad_tiempo, modalidad, tipo_pago, nombre_responsable_pago,
        email_responsable_pago, nombre_responsable_contrato, email_responsable_contrato,
        fono_responsable_contrato, prohibicion_contratacion, subcontratacion,
        unidad_tiempo_duracion_contrato, tiempo_duracion_contrato,
        tipo_duracion_contrato, justificacion_monto_estimado, observacion_contract,
        extension_plazo, es_base_tipo, unidad_tiempo_contrato_licitacion,
        valor_tiempo_renovacion, periodo_tiempo_renovacion, es_renovable,
        fecha_creacion, fecha_cierre, fecha_inicio, fecha_final,
        fecha_pub_respuestas, fecha_apertura_tecnica, fecha_apertura_economica,
        fecha_publicacion, fecha_adjudicacion, fecha_estimada_adjudicacion,
        fecha_soporte_fisico, fecha_tiempo_evaluacion, fecha_estimada_firma,
        fecha_visita_terreno, fecha_entrega_antecedentes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        nombre = VALUES(nombre),
        codigo_estado = VALUES(codigo_estado),
        estado = VALUES(estado),
        descripcion = VALUES(descripcion),
        dias_cierre = VALUES(dias_cierre),
        informada = VALUES(informada),
        codigo_tipo = VALUES(codigo_tipo),
        tipo = VALUES(tipo),
        tipo_convocatoria = VALUES(tipo_convocatoria),
        moneda = VALUES(moneda),
        etapas = VALUES(etapas),
        estado_etapas = VALUES(estado_etapas),
        toma_razon = VALUES(toma_razon),
        estado_publicidad_ofertas = VALUES(estado_publicidad_ofertas),
        justificacion_publicidad = VALUES(justificacion_publicidad),
        contrato = VALUES(contrato),
        obras = VALUES(obras),
        cantidad_reclamos = VALUES(cantidad_reclamos),
        unidad_tiempo_evaluacion = VALUES(unidad_tiempo_evaluacion),
        direccion_visita = VALUES(direccion_visita),
        direccion_entrega = VALUES(direccion_entrega),
        estimacion = VALUES(estimacion),
        fuente_financiamiento = VALUES(fuente_financiamiento),
        visibilidad_monto = VALUES(visibilidad_monto),
        monto_estimado = VALUES(monto_estimado),
        tiempo = VALUES(tiempo),
        unidad_tiempo = VALUES(unidad_tiempo),
        modalidad = VALUES(modalidad),
        tipo_pago = VALUES(tipo_pago),
        nombre_responsable_pago = VALUES(nombre_responsable_pago),
        email_responsable_pago = VALUES(email_responsable_pago),
        nombre_responsable_contrato = VALUES(nombre_responsable_contrato),
        email_responsable_contrato = VALUES(email_responsable_contrato),
        fono_responsable_contrato = VALUES(fono_responsable_contrato),
        prohibicion_contratacion = VALUES(prohibicion_contratacion),
        subcontratacion = VALUES(subcontratacion),
        unidad_tiempo_duracion_contrato = VALUES(unidad_tiempo_duracion_contrato),
        tiempo_duracion_contrato = VALUES(tiempo_duracion_contrato),
        tipo_duracion_contrato = VALUES(tipo_duracion_contrato),
        justificacion_monto_estimado = VALUES(justificacion_monto_estimado),
        observacion_contract = VALUES(observacion_contract),
        extension_plazo = VALUES(extension_plazo),
        es_base_tipo = VALUES(es_base_tipo),
        unidad_tiempo_contrato_licitacion = VALUES(unidad_tiempo_contrato_licitacion),
        valor_tiempo_renovacion = VALUES(valor_tiempo_renovacion),
        periodo_tiempo_renovacion = VALUES(periodo_tiempo_renovacion),
        es_renovable = VALUES(es_renovable),
        fecha_creacion = VALUES(fecha_creacion),
        fecha_cierre = VALUES(fecha_cierre),
        fecha_inicio = VALUES(fecha_inicio),
        fecha_final = VALUES(fecha_final),
        fecha_pub_respuestas = VALUES(fecha_pub_respuestas),
        fecha_apertura_tecnica = VALUES(fecha_apertura_tecnica),
        fecha_apertura_economica = VALUES(fecha_apertura_economica),
        fecha_publicacion = VALUES(fecha_publicacion),
        fecha_adjudicacion = VALUES(fecha_adjudicacion),
        fecha_estimada_adjudicacion = VALUES(fecha_estimada_adjudicacion),
        fecha_soporte_fisico = VALUES(fecha_soporte_fisico),
        fecha_tiempo_evaluacion = VALUES(fecha_tiempo_evaluacion),
        fecha_estimada_firma = VALUES(fecha_estimada_firma),
        fecha_visita_terreno = VALUES(fecha_visita_terreno),
        fecha_entrega_antecedentes = VALUES(fecha_entrega_antecedentes)
    `, [
      d.CodigoExterno, d.Nombre, d.CodigoEstado, d.Estado, d.Descripcion,
      d.DiasCierreLicitacion, d.Informada, d.CodigoTipo, d.Tipo, d.TipoConvocatoria,
      d.Moneda, d.Etapas, d.EstadoEtapas, d.TomaRazon, d.EstadoPublicidadOfertas,
      d.JustificacionPublicidad, d.Contrato, d.Obras, d.CantidadReclamos,
      d.UnidadTiempoEvaluacion, d.DireccionVisita, d.DireccionEntrega,
      d.Estimacion, d.FuenteFinanciamiento, d.VisibilidadMonto, d.MontoEstimado,
      d.Tiempo, d.UnidadTiempo, d.Modalidad, d.TipoPago, d.NombreResponsablePago,
      d.EmailResponsablePago, d.NombreResponsableContrato, d.EmailResponsableContrato,
      d.FonoResponsableContrato, d.ProhibicionContratacion, d.SubContratacion,
      d.UnidadTiempoDuracionContrato, d.TiempoDuracionContrato,
      d.TipoDuracionContrato, d.JustificacionMontoEstimado, d.ObservacionContract,
      d.ExtensionPlazo, d.EsBaseTipo, d.UnidadTiempoContratoLicitacion,
      d.ValorTiempoRenovacion, d.PeriodoTiempoRenovacion, d.EsRenovable,
      f.FechaCreacion, f.FechaCierre, f.FechaInicio, f.FechaFinal,
      f.FechaPubRespuestas, f.FechaActoAperturaTecnica, f.FechaActoAperturaEconomica,
      f.FechaPublicacion, f.FechaAdjudicacion, f.FechaEstimadaAdjudicacion,
      f.FechaSoporteFisico, f.FechaTiempoEvaluacion, f.FechaEstimadaFirma,
      f.FechaVisitaTerreno, f.FechaEntregaAntecedentes
    ]);

    if (yaExiste) {
      await conn.query('DELETE FROM adjudicaciones_item WHERE item_id IN (SELECT id FROM items WHERE codigo_externo = ?)', [d.CodigoExterno]);
      await conn.query('DELETE FROM items WHERE codigo_externo = ?', [d.CodigoExterno]);
      await conn.query('DELETE FROM adjudicaciones WHERE codigo_externo = ?', [d.CodigoExterno]);
      await conn.query('DELETE FROM compradores WHERE codigo_externo = ?', [d.CodigoExterno]);
    }

    if (d.Comprador) {
      await conn.query(`
        INSERT INTO compradores (
          codigo_externo, codigo_organismo, nombre_organismo, rut_unidad,
          codigo_unidad, nombre_unidad, direccion_unidad, comuna_unidad, region_unidad,
          rut_usuario, codigo_usuario, nombre_usuario, cargo_usuario
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        d.CodigoExterno,
        d.Comprador.CodigoOrganismo,
        d.Comprador.NombreOrganismo,
        d.Comprador.RutUnidad,
        d.Comprador.CodigoUnidad,
        d.Comprador.NombreUnidad,
        d.Comprador.DireccionUnidad,
        d.Comprador.ComunaUnidad,
        d.Comprador.RegionUnidad,
        d.Comprador.RutUsuario,
        d.Comprador.CodigoUsuario,
        d.Comprador.NombreUsuario,
        d.Comprador.CargoUsuario
      ]);
    }

    if (d.Adjudicacion) {
      await conn.query(`
        INSERT INTO adjudicaciones (
          codigo_externo, tipo, fecha, numero, numero_oferentes, url_acta
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        d.CodigoExterno,
        d.Adjudicacion.Tipo,
        d.Adjudicacion.Fecha,
        d.Adjudicacion.Numero,
        d.Adjudicacion.NumeroOferentes,
        d.Adjudicacion.UrlActa
      ]);
    }

    const items = d.Items?.Listado || [];
    for (const item of items) {
      const [res] = await conn.query(`
        INSERT INTO items (
          codigo_externo, correlativo, codigo_producto, codigo_categoria,
          categoria, nombre_producto, descripcion, unidad_medida, cantidad
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        d.CodigoExterno,
        item.Correlativo,
        item.CodigoProducto,
        item.CodigoCategoria,
        item.Categoria,
        item.NombreProducto,
        item.Descripcion,
        item.UnidadMedida,
        item.Cantidad
      ]);

      const itemId = res.insertId;
      if (item.Adjudicacion && itemId) {
        await conn.query(`
          INSERT INTO adjudicaciones_item (
            item_id, rut_proveedor, nombre_proveedor, cantidad, monto_unitario
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          itemId,
          item.Adjudicacion.RutProveedor,
          item.Adjudicacion.NombreProveedor,
          item.Adjudicacion.Cantidad,
          item.Adjudicacion.MontoUnitario
        ]);
      }
    }

    let estadoInfo = `(${d.Estado})`;
    if (yaExiste && estadoExistente !== d.Estado) {
      estadoInfo = `(${d.Estado} ← ${estadoExistente})`;
    }

    await conn.commit();
    logMensaje(`🟢 Recuperado ${d.CodigoExterno} ${estadoInfo} y guardado en BD`, 'success');
  } catch (err) {
    if (conn && conn.rollback) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        logMensaje(`⚠️ Error al hacer rollback: ${rollbackErr.message}`, 'warning');
      }
    }
    logMensaje(`❌ Error en ${d.CodigoExterno}: ${err.message}`, 'error');
  } finally {
    if (conn) conn.release();
  }
};
