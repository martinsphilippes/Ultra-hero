# Groscove Ultra — app das lojas (casca Expo)

A web de produção numa WebView, com login nativo (Google pelo navegador do sistema, Sign in with
Apple), compartilhar do sistema e tela própria sem conexão. Por que assim:
[`../docs/decisions/app-nas-lojas.md`](../docs/decisions/app-nas-lojas.md). Como publicar:
[`../docs/lojas.md`](../docs/lojas.md).

```bash
npm ci
npm run check            # typecheck + testes + permissões do manifest final do Android
npx expo start           # Expo Go não tem Sign in with Apple; use um development build (eas build --profile development)
npm run assets           # regenera ícones/splash/ficha (gerados da marca em `docs/brand/`)
```

`EXPO_PUBLIC_WEB_URL` escolhe a web que a casca abre (padrão: produção). Para apontar para o
`npm run dev` da raiz num aparelho, use o IP da máquina: `EXPO_PUBLIC_WEB_URL=http://192.168.0.10:3000 npx expo start`.
