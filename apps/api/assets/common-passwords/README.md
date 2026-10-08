# Contraseñas comunes (RN-A07)

`common-passwords.txt.gz`: 122 167 contraseñas, una por línea, normalizadas con NFKC y en minúsculas. La API las
carga en un `Set` al arrancar y rechaza una contraseña nueva si su forma NFKC en minúsculas está aquí.

## Procedencia

- [SecLists](https://github.com/danielmiessler/SecLists) (licencia MIT), commit `47cd752f4323`, 2026-10-07:
  - `Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt`
  - `Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt`
- Filtro: de 10 a 128 caracteres (code points) después de NFKC; minúsculas; sin duplicados. Las más cortas ya las
  rechaza el largo mínimo de RN-A07.
- Agregadas a mano, en español (P5): contraseña, contraseña1, contraseña123, contrasena1, arequipa123,
  lima123456, peru123456, nutricionista, nutricion123, teamo123456, futbol1234, administrador, bienvenido1 y
  gimnasio123.

## Regenerar

Descargar los dos archivos de SecLists y repetir el filtro (Python):

```python
import gzip, unicodedata
words = set()
for path in FILES:
    for line in open(path, encoding='utf-8', errors='ignore'):
        word = unicodedata.normalize('NFKC', line.rstrip('\r\n')).lower()
        if 10 <= len(word) <= 128:
            words.add(word)
words.update(SPANISH)
with gzip.GzipFile('common-passwords.txt.gz', 'wb', mtime=0) as out:
    out.write(('\n'.join(sorted(words)) + '\n').encode('utf-8'))
```
