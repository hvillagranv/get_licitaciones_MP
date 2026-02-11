import subprocess
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor

def ejecutar_node(fecha_inicio, fecha_fin, estado='suspendida'):
    comando = [
        'node',
        'backend/licitacionesPar.js',  # reemplazar por la ruta real
        fecha_inicio,
        fecha_fin,
        estado
    ]
    print(f"Ejecutando: {comando}")
    resultado = subprocess.run(comando, capture_output=True, text=True)
    print(resultado.stdout)
    print(resultado.stderr)

def generar_bloques_fechas(fecha_inicio, fecha_fin, dias_por_bloque=30):
    inicio = datetime.strptime(fecha_inicio, "%Y-%m-%d")
    fin = datetime.strptime(fecha_fin, "%Y-%m-%d")
    bloques = []

    while inicio <= fin:
        bloque_fin = min(inicio + timedelta(days=dias_por_bloque - 1), fin)
        bloques.append((inicio.strftime("%Y-%m-%d"), bloque_fin.strftime("%Y-%m-%d")))
        inicio = bloque_fin + timedelta(days=1)

    return bloques

# Configurar
fecha_inicio_total = "2006-04-01"
fecha_fin_total = "2025-06-06"
estado = "suspendida"
bloques = generar_bloques_fechas(fecha_inicio_total, fecha_fin_total, dias_por_bloque=30)

# Ejecutar en paralelo con máximo 4 procesos
with ThreadPoolExecutor(max_workers=4) as executor:
    for fi, ff in bloques:
        executor.submit(ejecutar_node, fi, ff, estado)
