#!/usr/bin/env python3
"""
Script para reclasificar productos usando un modelo de clasificación de texto
Analiza descripciones y nombres de productos para asignar categorías correctas
"""

import pymysql
import os
import sys
from dotenv import load_dotenv
import re
from collections import Counter
import json

# Cargar variables de entorno
load_dotenv('Microservicios/Productos/.env')

# Configuración de la base de datos
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASS', ''),
    'database': os.getenv('DB_NAME', 'base20'),
    'charset': 'utf8mb4'
}

# Mapeo de categorías
CATEGORIAS = {
    1: 'Joyas',
    2: 'Mercancía',
    3: 'Vehículos'
}

# Palabras clave por categoría (mejoradas)
KEYWORDS = {
    'Joyas': [
        'oro', 'plata', 'diamante', 'anillo', 'anillos', 'collar', 'pulsera', 'arete', 'aretes','argollas', 'argolla',
        'cadena', 'reloj', 'joya', 'joyas', 'gemas', 'perla', 'perlas', 'zafiro',
        'rubí', 'esmeralda', 'brillante', 'oro blanco', 'oro amarillo', 'plata 925',
        'plata 950', 'oro 18k', 'oro 14k', 'oro 24k', 'quilate', 'kilate', 'kt',
        'bracelet', 'ring', 'necklace', 'earring', 'watch', 'jewelry', 'gold', 'silver',
        'argolla', 'argollas', 'sortija', 'sortijas', 'alianza', 'alianzas',
        '18k', '14k', '24k', '10k', '22k', '18kt', '14kt', '24kt', '10kt', '22kt',
        '18 k', '14 k', '24 k', '10 k', '22 k', '18 kt', '14 kt', '24 kt',
        'oro 18', 'oro 14', 'oro 24', 'oro 10', 'oro 22',
        'pendiente', 'pendientes', 'broche', 'broches', 'dije', 'dijes',
        'gemstone', 'precious', 'metal', 'jewel', 'jewels'
    ],
    'Mercancía': [
        'telefono', 'celular', 'iphone', 'samsung', 'tablet', 'laptop', 'computador',
        'televisor', 'tv', 'refrigerador', 'nevera', 'lavadora', 'microondas',
        'equipo', 'herramienta', 'electrodomestico', 'electronico', 'mueble', 'silla',
        'mesa', 'cama', 'colchon', 'ropa', 'zapatos', 'bolso', 'mochila', 'bicicleta',
        'moto', 'motocicleta', 'consola', 'playstation', 'xbox', 'nintendo', 'cámara',
        'camara', 'audifonos', 'auriculares', 'speaker', 'parlante', 'radio', 'stereo',
        'phone', 'mobile', 'laptop', 'computer', 'furniture', 'appliance', 'tool'
    ],
    'Vehículos': [
        'carro', 'auto', 'automovil', 'vehiculo', 'moto', 'motocicleta', 'bicicleta',
        'camioneta', 'camion', 'bus', 'buseta', 'taxi', 'moto', 'scooter', 'patineta',
        'patin', 'carroceria', 'motor', 'transmision', 'llantas', 'neumaticos', 'bateria',
        'accesorios auto', 'repuestos', 'car', 'vehicle', 'motorcycle', 'bike', 'truck',
        'suv', 'sedan', 'hatchback', 'pickup', 'van', 'automotive', 'auto parts',  'bicicleta', 'bicicletas'
    ]
}

def normalizar_texto(texto):
    """Normaliza el texto para análisis"""
    if not texto:
        return ''
    texto = str(texto).lower()
    # Remover caracteres especiales pero mantener espacios
    texto = re.sub(r'[^\w\s]', ' ', texto)
    # Normalizar espacios
    texto = re.sub(r'\s+', ' ', texto)
    return texto.strip()

def calcular_puntuacion_categoria(texto, categoria):
    """Calcula una puntuación para una categoría basada en palabras clave"""
    texto_norm = normalizar_texto(texto)
    if not texto_norm:
        return 0
    
    palabras = texto_norm.split()
    keywords = KEYWORDS.get(categoria, [])
    
    # Contar coincidencias exactas
    coincidencias = sum(1 for palabra in palabras if palabra in keywords)
    
    # Contar coincidencias parciales (substrings)
    coincidencias_parciales = sum(1 for keyword in keywords if keyword in texto_norm)
    
    # Puntuación combinada (exactas valen más)
    puntuacion = (coincidencias * 2) + coincidencias_parciales
    
    # Bonus especiales para Joyas
    if categoria == 'Joyas':
        # Detectar quilates en formato numérico (18k, 14k, etc.)
        quilates_pattern = r'\b(10|14|18|22|24)\s*[kkt]\b'
        if re.search(quilates_pattern, texto_norm):
            puntuacion += 5  # Bonus alto por quilates
        
        # Detectar "argolla" o "argollas" (anillos)
        if 'argolla' in texto_norm or 'argollas' in texto_norm:
            puntuacion += 3
        
        # Detectar "peso" seguido de número (común en joyas)
        if re.search(r'\bpeso\s+\d+', texto_norm):
            puntuacion += 2
    
    # Bonus por longitud del texto (más contexto = más confianza)
    if len(palabras) > 5:
        puntuacion *= 1.1
    
    return puntuacion

def clasificar_producto(descripcion, nombre=''):
    """Clasifica un producto en una categoría usando análisis de texto"""
    texto_completo = f"{nombre} {descripcion}".strip()
    
    if not texto_completo:
        return None, 0
    
    puntuaciones = {}
    for categoria in CATEGORIAS.values():
        puntuaciones[categoria] = calcular_puntuacion_categoria(texto_completo, categoria)
    
    # Obtener la categoría con mayor puntuación
    mejor_categoria = max(puntuaciones.items(), key=lambda x: x[1])
    
    if mejor_categoria[1] == 0:
        # Si no hay coincidencias, usar heurística simple
        texto_lower = texto_completo.lower()
        if any(kw in texto_lower for kw in ['oro', 'plata', 'diamante', 'joya', 'anillo', 'collar']):
            return 'Joyas', 1
        elif any(kw in texto_lower for kw in ['carro', 'auto', 'vehiculo', 'moto', 'bicicleta']):
            return 'Vehículos', 1
        else:
            return 'Mercancía', 1  # Default
    
    categoria_id = [k for k, v in CATEGORIAS.items() if v == mejor_categoria[0]][0]
    return mejor_categoria[0], mejor_categoria[1]

def obtener_productos(conn):
    """Obtiene todos los productos de la base de datos"""
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("""
        SELECT
            art_consecutivo as id,
            art_descripcion as descripcion,
            art_clase as categoria_actual,
            art_tipo as tipo,
            art_valor as precio,
            art_cantidad as cantidad
        FROM articulos
        WHERE art_descripcion IS NOT NULL
        AND art_descripcion != ''
        ORDER BY art_consecutivo
    """)
    productos = cursor.fetchall()
    cursor.close()
    return productos

def actualizar_categoria(conn, producto_id, nueva_categoria_id):
    """Actualiza la categoría de un producto"""
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE articulos 
        SET art_clase = %s 
        WHERE art_consecutivo = %s
    """, (nueva_categoria_id, producto_id))
    conn.commit()
    cursor.close()

def generar_reporte_cambios(cambios):
    """Genera un reporte de los cambios propuestos"""
    reporte = {
        'total_productos': len(cambios),
        'cambios_por_categoria': {},
        'sin_cambios': 0,
        'con_cambios': 0,
        'detalles': []
    }
    
    for cambio in cambios:
        categoria_antigua = CATEGORIAS.get(cambio['categoria_actual'], 'Desconocida')
        categoria_nueva = cambio['categoria_nueva']
        
        if categoria_antigua != categoria_nueva:
            reporte['con_cambios'] += 1
            key = f"{categoria_antigua} → {categoria_nueva}"
            reporte['cambios_por_categoria'][key] = reporte['cambios_por_categoria'].get(key, 0) + 1
        else:
            reporte['sin_cambios'] += 1
        
        reporte['detalles'].append({
            'id': cambio['id'],
            'descripcion': cambio['descripcion'][:50] + '...' if len(cambio['descripcion']) > 50 else cambio['descripcion'],
            'categoria_actual': categoria_antigua,
            'categoria_nueva': categoria_nueva,
            'confianza': cambio['confianza'],
            'cambiar': categoria_antigua != categoria_nueva
        })
    
    return reporte

def main():
    """Función principal"""
    # Set UTF-8 encoding for Windows
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
    
    aplicar_cambios = '--actualizar' in sys.argv or '--apply' in sys.argv
    solo_analisis = not aplicar_cambios
    
    print("=" * 60)
    print("RECLASIFICACIÓN DE PRODUCTOS")
    print("=" * 60)
    print()
    
    # Conectar a la base de datos
    try:
        conn = pymysql.connect(**DB_CONFIG)
        print(f"✓ Conectado a la base de datos: {DB_CONFIG['database']}")
    except pymysql.Error as e:
        print(f"✗ Error conectando a la base de datos: {e}")
        sys.exit(1)
    
    # Obtener productos
    print("Obteniendo productos de la base de datos...")
    productos = obtener_productos(conn)
    print(f"✓ Encontrados {len(productos)} productos")
    print()
    
    # Clasificar productos
    print("Analizando y clasificando productos...")
    cambios = []
    
    for i, producto in enumerate(productos, 1):
        if i % 10000 == 0:
            print(f"  Procesados {i:,}/{len(productos):,} productos...")
        
        descripcion = producto.get('descripcion', '')
        categoria_nueva, confianza = clasificar_producto(descripcion)
        
        categoria_id_nueva = [k for k, v in CATEGORIAS.items() if v == categoria_nueva][0]
        
        cambios.append({
            'id': producto['id'],
            'descripcion': descripcion,
            'categoria_actual': producto.get('categoria_actual'),
            'categoria_nueva': categoria_nueva,
            'categoria_id_nueva': categoria_id_nueva,
            'confianza': confianza
        })
    
    print(f"✓ Análisis completado")
    print()
    
    # Generar reporte
    reporte = generar_reporte_cambios(cambios)
    
    # Mostrar resumen
    print("=" * 60)
    print("RESUMEN DE ANÁLISIS")
    print("=" * 60)
    print(f"Total de productos analizados: {reporte['total_productos']:,}")
    print(f"Productos que requieren cambio: {reporte['con_cambios']:,}")
    print(f"Productos sin cambios: {reporte['sin_cambios']:,}")
    print()
    
    if reporte['cambios_por_categoria']:
        print("Cambios por categoría:")
        for cambio, cantidad in sorted(reporte['cambios_por_categoria'].items(), key=lambda x: x[1], reverse=True):
            print(f"  {cambio}: {cantidad:,}")
        print()
    
    # Guardar reporte en archivo
    reporte_file = 'scripts/reporte_reclasificacion.json'
    with open(reporte_file, 'w', encoding='utf-8') as f:
        json.dump(reporte, f, indent=2, ensure_ascii=False)
    print(f"✓ Reporte guardado en: {reporte_file}")
    print()
    
    if solo_analisis:
        print("=" * 60)
        print("MODO ANÁLISIS (Sin cambios aplicados)")
        print("=" * 60)
        print("Para aplicar los cambios, ejecuta:")
        print("  python scripts/reclasificar-productos.py --actualizar")
        print()
        
        # Mostrar algunos ejemplos
        print("Ejemplos de cambios propuestos (primeros 10):")
        print("-" * 60)
        ejemplos = [c for c in cambios if c['categoria_actual'] != c['categoria_id_nueva']][:10]
        for ejemplo in ejemplos:
            cat_actual = CATEGORIAS.get(ejemplo['categoria_actual'], 'Desconocida')
            print(f"ID {ejemplo['id']:6d} | {cat_actual:12s} → {ejemplo['categoria_nueva']:12s} | Confianza: {ejemplo['confianza']:.1f}")
            print(f"  Descripción: {ejemplo['descripcion'][:70]}...")
            print()
    else:
        # Aplicar cambios
        print("=" * 60)
        print("APLICANDO CAMBIOS")
        print("=" * 60)
        
        productos_a_cambiar = [c for c in cambios if c['categoria_actual'] != c['categoria_id_nueva']]
        print(f"Se actualizarán {len(productos_a_cambiar):,} productos")
        print()
        
        respuesta = input("¿Deseas continuar? (sí/no): ").strip().lower()
        if respuesta not in ['sí', 'si', 'yes', 'y', 's']:
            print("Operación cancelada.")
            conn.close()
            return
        
        print()
        print("Aplicando cambios...")
        
        actualizados = 0
        errores = 0
        
        for i, cambio in enumerate(productos_a_cambiar, 1):
            if i % 1000 == 0:
                print(f"  Actualizados {i:,}/{len(productos_a_cambiar):,} productos...")
            
            try:
                actualizar_categoria(conn, cambio['id'], cambio['categoria_id_nueva'])
                actualizados += 1
            except Exception as e:
                print(f"  ✗ Error actualizando producto {cambio['id']}: {e}")
                errores += 1
        
        print()
        print("=" * 60)
        print("RESULTADO")
        print("=" * 60)
        print(f"✓ Productos actualizados: {actualizados:,}")
        if errores > 0:
            print(f"✗ Errores: {errores:,}")
        print()
        print("✓ Reclasificación completada exitosamente!")
    
    conn.close()

if __name__ == '__main__':
    main()

