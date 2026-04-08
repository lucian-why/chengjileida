import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    plugins: [],
    server: {
        open: true
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        cssCodeSplit: false,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                admin: resolve(__dirname, 'admin/index.html')
            }
        },
        target: 'es2020'
    }
});
