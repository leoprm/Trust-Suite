# Trust ADN — Contexto de implementación para Trust Suite

> Síntesis técnica del documento definitorio **Trust ADN Español.pdf** para mantener el desarrollo de Trust Suite alineado con la visión completa de Trust.

## 1. Visión y propósito

Trust es un sistema socioeconómico, político, educativo y productivo diseñado para crear comunidades más justas, transparentes, eficientes, autónomas y adaptativas. No busca imponerse por revolución ni fuerza, sino adoptarse gradualmente por conveniencia: si funciona mejor que las alternativas, las comunidades deberían gravitar hacia él de manera orgánica.

Trust parte de una crítica al sistema actual: concentración de riqueza, especulación, obsolescencia programada, captura política, baja transparencia, dependencia de donaciones para necesidades humanitarias, creación artificial de deseos y explotación ineficiente de recursos finitos. Frente a eso propone un sistema donde las necesidades reales son el punto de partida de la economía, la política y el trabajo.

Trust Suite es la versión práctica actual de esa visión: una suite de tres PWAs para hacer vivir una célula funcional de Trust antes de construir la arquitectura civilizatoria completa.

## 2. Principios constitucionales no negociables

Estos principios deben tratarse como invariantes de diseño. Si una decisión técnica los rompe, probablemente está mal modelada.

- **Transparencia:** sin transparencia no hay confianza. Procesos, votaciones, presupuestos, resultados y reglas deben ser auditables.
- **Eficiencia:** sin eficiencia no hay futuro. El sistema debe reducir duplicación, desperdicio, burocracia y fricción innecesaria.
- **Autonomía:** sin autonomía no hay libertad. Trees, Branches y Personas deben tener soberanía real dentro de reglas claras.
- **Adaptabilidad:** sin adaptabilidad no hay verdadera comprensión. Trust debe poder evolucionar por crítica, evidencia y votación.
- **La autoridad no se compra:** fiat, inversión externa o capacidad de pago no pueden generar XP, Nivel, votos, reputación, Berries ni autoridad política.
- **El dinero externo no debe contaminar la gobernanza interna:** fiat puede financiar recursos externos, pero no comprar prioridad política dentro del Tree.
- **La contribución verificable es la fuente legítima de reputación:** XP y Trace deben derivarse de trabajo, aprendizaje, auditoría o participación comprobable.
- **La comunidad vota antes de financiar:** la asignación de recursos surge de prioridades explícitas, no de campañas opacas ni captura por capital.
- **Necesidades antes que deseos:** el sistema debe priorizar necesidades esenciales y permitir deseos solo cuando no desplacen prioridades críticas.
- **Privacidad personal, transparencia sistémica:** los procesos deben ser transparentes, pero los datos personales pertenecen al usuario.
- **No oligarquías permanentes:** el diseño debe prevenir acumulación indefinida de poder por antigüedad, riqueza o posición histórica.
- **Mantenimiento y reciclaje son fases de primera clase:** construir no basta; todo proyecto debe contemplar continuidad, reparación y circularidad.
- **Expertise informa, no reemplaza, a la democracia:** los expertos ponderan y orientan decisiones, pero no deben convertirse en una clase soberana.

## 3. Actores y estructuras principales

- **Persona:** participante individual de Trust. Expresa Necesidades, vota, contribuye, gana XP, desarrolla Trace y participa en Branches/Roots.
- **Tree:** comunidad autónoma. Es la unidad organizativa central en Trust Suite. Define prioridades, gestiona Branches, economía interna, gobernanza y tesoro.
- **Turtle:** capa federada/global del Trust completo. Coordina recursos, resiliencia, intercambio entre Trees, estándares y gobernanza amplia.
- **Root:** unidad orientada a recursos, materias primas, suministro, reciclaje y base material.
- **Trunk:** núcleo de coordinación de un Tree; facilita gobernanza, comunicación, distribución de recursos y estabilidad estructural.
- **Branch:** unidad de trabajo/proyecto. Resuelve Necesidades o Deseos mediante fases estructuradas.
- **External Agent:** actor externo —cliente, sponsor, contacto, aprobador u observador— que puede traer necesidades o fiat, pero no autoridad política interna.
- **Auditor / Evaluador:** participante que revisa tareas, evidencias, KPI, cumplimiento o calidad, generando confianza y XP verificable.
- **Expert:** Persona con credenciales Trace o experiencia validada en un campo. Su pericia puede ponderar decisiones del campo correspondiente.

## 4. Economía: capas y reglas

Trust separa estrictamente distintas formas de valor.

### 4.1 Fiat

Fiat pertenece a la relación con el mundo externo. Sirve para:

- ingresos externos,
- gastos reales,
- materiales,
- infraestructura,
- impuestos,
- reservas,
- mantenimiento,
- servicios externos,
- fondos del Tree,
- encargos comerciales externos.

Reglas:

- Fiat es ledger externo.
- Fiat no otorga XP.
- Fiat no otorga Nivel.
- Fiat no otorga votos.
- Fiat no otorga reputación Trace.
- Fiat no compra Berries de forma directa si eso corrompe la economía interna.
- Fiat no compra autoridad dentro del Tree.
- Los presupuestos fiat deben ser explícitos, justificados y auditables.
- El uso de fiat debe mostrar costo de oportunidad.

En Trust completo aparece el **Protocolo de Intercambio Fiat de Ciclo Cerrado**: Trust no puede imprimir valor para gastar fuera; solo puede gastar fiat ganado previamente del exterior. También aparece una **Tesorería Federada** con Tesoro del Tree y Fondo de Resiliencia de Turtle.

### 4.2 Berries

Berries son la moneda interna de un Tree.

Rol:

- circulación interna,
- salarios internos,
- intercambio dentro del Tree,
- coordinación económica comunitaria,
- incentivo a participación continua.

Características del ADN:

- salario mensual basado en Nivel,
- emisión ligada a reglas comunitarias,
- caducidad por fecha —año/mes— para evitar acumulación pasiva,
- circulación interna únicamente,
- no retiro a exchanges/wallets externas,
- transacciones verificables,
- diseño anti-especulación,
- validación idealmente sin recompensas monetarias para validadores.

En Trust Suite, Berries deben tratarse como una capa interna separada del ledger fiat.

### 4.3 XP

XP es reputación/contribución verificable, no dinero.

Se gana por:

- contribuir a Ideas,
- Investigación,
- Desarrollo,
- Producción,
- Distribución,
- Mantenimiento,
- Reciclaje,
- completar tareas,
- auditorías,
- mentorías,
- participación cívica,
- evaluación informada,
- satisfacción de beneficiarios,
- resolver necesidades difíciles.

XP puede influir en:

- Nivel,
- salario base en Berries,
- credibilidad,
- elegibilidad para tareas o liderazgo,
- peso experto en campos específicos,
- reputación pública Trace.

XP debe tener mecanismos anti-oligarquía: decaimiento, rotación, zonas de dificultad creciente o límites funcionales para evitar que una élite histórica controle indefinidamente el sistema.

### 4.4 Trace

Trace es la capa educativa/reputacional.

Rol:

- mostrar trayectoria,
- validar habilidades,
- entregar badges,
- certificar campos de expertise,
- guiar rutas educativas,
- permitir mentorías,
- exportar portafolios,
- facilitar recertificación entre comunidades.

Principio clave:

> La competencia es universal; el estatus es local.

El conocimiento pertenece a la Persona, pero XP/Nivel/Berries dependen de la economía local de cada Tree. Por tanto, una persona puede recertificar habilidades al migrar, pero no debería importar poder económico o político bruto desde otro sistema.

### 4.5 Nutrients

Nutrients son una capa de Turtle para intercambio entre Trees y acceso a recursos federados. En Trust Suite actual parecen fuera del MVP inmediato, pero deben considerarse al diseñar interfaces futuras entre Trees.

## 5. Gobernanza

Trust combina democracia, trazabilidad y expertise.

Elementos clave:

- Votación anónima, segura, verificable e intransferible.
- Puntos de Necesidad para expresar prioridad.
- Voto informado: la interfaz debe educar antes de decisiones importantes.
- Expertos ponderan campos donde tienen credenciales verificadas.
- La comunidad conserva decisión política final.
- Las reglas del sistema pueden modificarse mediante propuestas y votación.
- Hay mecanismos de extinción para retirar apoyo a servicios, paradigmas o estructuras fallidas.
- Los líderes deben ser seleccionados por una combinación de desempeño, recomendación sistémica y voto del equipo.
- Deben existir revisiones, límites de mandato y rotación.
- La gobernanza debe mostrar consecuencias: presupuestos, impacto sobre fondos, alternativas pendientes y riesgos.

Conceptos relevantes:

- **F-UEC:** coeficiente de pericia ponderado por campo.
- **PEE:** peso/efecto de expertise en votaciones.
- **CUF:** criterio de uso funcional para validar si una necesidad/propuesta cumplió su función.
- **Protocolo de Integridad Democrática:** participación regular + voto informado + calidad de decisión.
- **Protocolo de la Cumbre:** evita que la cúspide del poder se vuelva permanente.

## 6. Ciclo de vida del trabajo

La secuencia general de proyectos/Branches:

1. **Necesidad o Deseo**
2. **Idea**
3. **Investigación**
4. **Desarrollo**
5. **Producción**
6. **Distribución**
7. **Mantenimiento**
8. **Reciclaje**

### Flujo lógico

- Una Persona, Branch o Root expresa una Necesidad.
- Las Personas asignan Puntos de Necesidad según impacto real.
- Surgen Ideas para resolverla.
- Ideas se discuten, votan y refinan.
- Investigación valida viabilidad.
- Desarrollo convierte la idea en plan, presupuesto, organigrama, recursos y fases.
- Producción ejecuta.
- Distribución entrega a beneficiarios.
- La satisfacción comunitaria alimenta XP.
- Mantenimiento sostiene la solución.
- Reciclaje recupera materiales o conocimiento al final del ciclo.

### Branches y Roots

Branches y Roots también pueden tener Necesidades propias. A diferencia de Personas, sus Necesidades son por defecto funcionales, no deseos: existen para cumplir su propósito dentro del sistema.

### Servicios públicos

Una Need con apoyo sostenido y abrumador puede convertirse en **Sustained Need** y ser operada por una **Sustenance Branch**. Esto libera Puntos de Necesidad de los usuarios y transforma la necesidad en servicio permanente con supervisión continua.

Interacciones del panel de servicios públicos:

- **Propuesta Delta:** mejora incremental.
- **Propuesta Omega:** cambio/reemplazo fundamental.
- **Cláusula de Extinción:** retirar apoyo y eventualmente cerrar el servicio.

## 7. Branch OS / BOS

BOS —Branch Operating System— es el sistema operativo interno de una Branch.

Principio:

> El BOS no es un sistema de control. Es un marco transparente, democrático y voluntario para facilitar rendición de cuentas, asignación justa de recursos y distribución equitativa de recompensas.

Componentes:

- **Trace de Tareas:** registro auditable de tareas, responsables, dificultad y finalización.
- **Fondo de Recompensa de XP:** presupuesto reputacional asignado a la Branch tras aprobar su propuesta.
- **Consenso de Esfuerzo:** distribución democrática y proporcional del XP según dificultad y tareas completadas.
- **Calificación de Dificultad Descentralizada:** miembros califican tareas.
- **Autoexclusión:** quien se asigna una tarea no puede inflar su propia dificultad.
- **Media Recortada Asimétrica:** descarta valores atípicos bajos para evitar sabotaje estratégico.
- **Distribución proporcional automatizada:** XP final según valor de dificultad completado.

BOS también contempla un modo bimodal:

- **El Escudo:** modo estándar, más seguro, democrático, lento y resistente a abuso.
- **La Lanza:** modo de urgencia, más rápido, con salvaguardas para evitar normalización del poder excepcional.

Para Trust Suite, `branch-os` debería implementarse como herramienta de autogestión democrática, no como ERP jerárquico tradicional.

## 8. Reputación, educación y Trace

Trace busca democratizar educación y certificación.

Funciones:

- rutas formativas en árbol,
- estadísticas de éxito,
- demanda estimada,
- tiempo promedio de progreso,
- exámenes prácticos periódicos,
- badges por habilidad,
- multiplicadores de XP por campo,
- mentorías,
- Path Forum para metodologías alternativas,
- Explorer Booster para innovación educativa,
- sprints de aprendizaje,
- evaluación por capas: datos + revisión de pares,
- exportación de portafolio.

Regla de interoperabilidad:

- El conocimiento puede revalidarse.
- El capital político local no se importa automáticamente.
- Al entrar a un nuevo sistema, la Persona puede empezar económicamente desde cero, pero recertificar más rápido habilidades reales.

## 9. Privacidad, datos y auditoría

Trust debe combinar transparencia sistémica con soberanía individual.

Principios:

- Procesos públicos/auditables.
- Datos personales privados por defecto.
- Consentimiento granular.
- Consentimiento just-in-time.
- Panel de consentimiento revocable.
- Derecho al olvido.
- Etiqueta nutricional de datos: UI simple y visual para explicar qué datos se piden y por qué.
- Responder solicitudes de consentimiento puede otorgar XP, independientemente de aceptar o denegar.
- Privacidad diferencial para datos agregados.
- Auditoría algorítmica para integridad sistémica.
- Desanonimización solo bajo causa probable matemática y proceso definido.

Conceptos:

- **Velo Contextual:** privacidad por capas según contexto.
- **PDAA:** Protocolo de Privacidad Diferencial y Auditoría Algorítmica.
- **Centinela Económico / Sentinel:** IA o sistema de detección de anomalías.
- **Niebla Temporal:** separación entre feedback rápido privado e impacto reputacional lento/público para evitar represalias.
- **Protocolo de Bienestar:** apoyo mental opt-in, con permisos granulares y derecho al olvido.

## 10. Mecánicas y conceptos nombrados

- **Trust:** sistema socioeconómico/político/educativo completo.
- **Trust Suite:** implementación práctica actual en tres PWAs.
- **Turtle:** capa federada de recursos, gobernanza amplia y resiliencia.
- **Tree:** comunidad autónoma.
- **Root:** unidad/proyecto de recursos, suministro o reciclaje.
- **Trunk:** núcleo coordinador del Tree.
- **Branch:** unidad de trabajo/proyecto.
- **BOS:** Branch Operating System.
- **Need / Necesidad:** prioridad esencial expresada por Personas o estructuras.
- **Desire / Deseo:** prioridad no esencial.
- **Puntos de Necesidad:** presupuesto de atención/prioridad asignado por Persona.
- **Idea:** propuesta para resolver una Necesidad o Deseo.
- **Investigación:** validación de viabilidad.
- **Desarrollo:** diseño de solución, plan, recursos y organigrama.
- **Producción:** ejecución del producto/servicio.
- **Distribución:** entrega a beneficiarios.
- **Mantenimiento:** continuidad del servicio/producto.
- **Reciclaje:** recuperación y circularidad.
- **Berries:** moneda interna de Tree.
- **Nutrients:** moneda/recurso federado de Turtle.
- **XP:** reputación por contribución verificable.
- **Nivel:** progresión derivada de XP.
- **Trace:** sistema educativo/reputacional portable.
- **Trace Badges:** credenciales que multiplican XP en campos concretos.
- **Explorer Booster:** incentivo a rutas educativas novedosas.
- **Path Forum:** foro de metodologías/rutas de aprendizaje.
- **F-UEC:** coeficiente de pericia por campo.
- **PEE:** ponderación experta en votaciones.
- **CUF:** criterio de uso funcional.
- **Sustained Need:** necesidad convertida en servicio permanente.
- **Sustenance Branch:** Branch dedicada a servicio público sostenido.
- **Propuesta Delta:** mejora incremental de servicio público.
- **Propuesta Omega:** reemplazo fundamental de servicio público.
- **Cláusula de Extinción:** retiro de apoyo y posible cierre de servicio.
- **Trace de Tareas:** registro auditable de tareas dentro de BOS.
- **Consenso de Esfuerzo:** reparto justo de XP por dificultad y contribución.
- **Escudo:** modo operativo estándar, seguro y democrático.
- **Lanza:** modo operativo rápido para urgencias.
- **Tesoro del Árbol:** fondo fiat soberano de un Tree.
- **Fondo de Resiliencia de Turtle:** fondo federado para crisis o estabilización.
- **Intercambio Fiat de Ciclo Cerrado:** fiat externo solo se gasta si fue ganado externamente.
- **Tesorería Federada:** modelo fiscal Tree/Turtle.
- **Mercado Trust:** mercado P2P interno restringido, con análisis de precios y reglas comunitarias.
- **Pozo de los Deseos:** redistribución estocástica de Berries próximas a expirar.
- **Hora Dorada:** ritual cívico diario limitado para evitar apps adictivas.
- **Domestic Badge:** compensación por cuidado de dependientes sin vigilar el hogar.
- **Protocolo de Bienestar:** apoyo mental voluntario y consentido.
- **Velo Contextual:** privacidad por capas.
- **Protocolo Fénix:** recuperación/reinicio ante crisis.
- **Niebla Temporal:** desincronización de feedback privado e impacto público.
- **PDAA:** privacidad diferencial y auditoría algorítmica.
- **Centinela Económico:** detección de anomalías.
- **Protocolo de Sucesión:** replicar soluciones probadas sin monopolios.
- **Branch Alfa:** Branch histórica exitosa.
- **Branch Sucesora / Injertada:** nueva Branch híbrida basada en solución probada.
- **Vástagos:** núcleo veterano de una Branch Alfa.
- **Portainjerto:** talento nuevo incorporado por selección/lotería ponderada.
- **Sandbox:** fase inicial sin riesgos de una comunidad.
- **Evento Génesis:** transición oficial de proto-Tree a Tree.
- **Live:** fase real posterior al Génesis.
- **Nautilus:** arquitectura de inteligencia compartimentada.
- **Proto-Turtle:** versión inicial de Turtle.
- **Ágora de Necesidades:** espacio inicial/MVP para publicar y votar necesidades.

## 11. Trust completo vs Trust Suite actual

### Trust completo

Incluye:

- federación de Trees,
- Turtle global,
- Roots y gestión material,
- Nutrients,
- recursos naturales,
- protocolos legales,
- mesh/IPFS,
- resiliencia civilizatoria,
- IA distribuida,
- educación completa,
- mercados internos,
- servicios públicos,
- tesorería federada,
- protocolos de secesión/migración,
- integración industrial y ecológica.

### Trust Suite actual

Debe enfocarse en una célula funcional:

- Tree operativo,
- Branches,
- Needs,
- Ideas/tareas,
- XP,
- Berries,
- Trace,
- ledger fiat externo,
- necesidades externas,
- propuestas con presupuesto,
- autosustento,
- clientes externos sin poder político,
- exportabilidad,
- privacidad básica,
- paneles PWA.

Las tres PWAs quedan alineadas así:

### trust-lite

Vida interna del Tree:

- Needs,
- Ideas,
- Branches,
- tareas,
- XP,
- Berries,
- votaciones,
- miembros,
- gobernanza.

### trace-lite

Identidad verificable:

- trayectoria,
- badges,
- habilidades,
- evidencias,
- exportación,
- reputación pública/privada,
- recertificación futura.

### branch-os

Operación concreta:

- tareas,
- BOS,
- fiat externo,
- presupuestos,
- autosustento,
- clientes externos,
- contratos externos,
- sustainability split,
- ledger operativo,
- coordinación sin contaminación política.

## 12. Citas clave

> “Este sistema pretende ser más justo, con más oportunidades, mayor transparencia, eficiencia, democracia y menos corrupción.”

> “Este sistema no se impondrá por la fuerza ni por la revolución. Se adoptará de forma gradual y orgánica por conveniencia…”

> “Transparencia: Sin ella no hay confianza. Eficiencia: Sin ella no hay futuro. Autonomía: Sin ella no hay libertad. Adaptabilidad: Sin ella no hay verdadera comprensión.”

> “Actualmente la gente vota con su billetera, pero no todos tienen el mismo número de votos. Trust invierte este proceso. Primero, usted vota y, en función del resultado, se generan Berries…”

> “El ecosistema Trust no puede imprimir valor para gastar en el exterior. Solo puede gastar en el exterior (Fiat) el valor que ha ganado previamente del exterior.”

## 13. Reglas prácticas para desarrollo

Cuando se implemente un módulo nuevo en Trust Suite, revisar:

1. ¿Este módulo permite que fiat compre autoridad? Si sí, rediseñar.
2. ¿Separa claramente fiat, Berries, XP y Trace? Si no, separar modelos/servicios.
3. ¿El usuario entiende consecuencias de una votación o presupuesto? Si no, mejorar UI/API.
4. ¿La acción genera reputación por contribución verificable? Si no, no debe otorgar XP.
5. ¿Hay auditoría/evidencia suficiente? Si no, registrar eventos y metadatos.
6. ¿El dato personal es realmente necesario? Si sí, pedir consentimiento claro; si no, no recolectarlo.
7. ¿La solución favorece mantenimiento y reciclaje o solo creación? Si solo crea, completar ciclo.
8. ¿Centraliza poder permanentemente? Si sí, añadir rotación, caducidad, revisión o cláusula de extinción.
9. ¿Permite participación democrática informada? Si no, agregar contexto, expertos, resúmenes o simulación de impacto.
10. ¿Puede funcionar como MVP sin prometer Turtle completo? Si no, reducir scope.

## 14. Ambigüedades / preguntas abiertas

- La relación exacta entre Berries y fiat cambia según secciones: algunas hablan de conversión externa con tarifa; Trust Suite actual bloquea conversión directa fiat -> Berries. Para MVP, mantener bloqueo salvo decisión explícita.
- Nutrients y Turtle aparecen como arquitectura completa, pero probablemente están fuera del scope inmediato de Trust Suite.
- Blockchain/DAG se menciona como ideal, pero MVP puede simular ledger auditable en base de datos hasta que exista infraestructura real.
- Algunos protocolos son civilizatorios o de largo plazo; no deben implementarse antes de estabilizar Tree/Branch/Trace básicos.
- Se debe definir qué partes de Trace son públicas por defecto y qué partes requieren consentimiento explícito.
- Se debe definir con precisión cuándo una ExternalNeed puede convertirse en tareas internas sin comprar prioridad política.

---

**Resumen operativo:** Trust Suite debe implementar una célula viable de Trust: una comunidad autónoma que prioriza necesidades, organiza Branches, recompensa contribución verificable con XP/Trace, coordina circulación interna con Berries y usa fiat solo como ledger externo para recursos reales, sin permitir que el dinero compre poder político.
