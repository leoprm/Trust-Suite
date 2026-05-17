// Test import from src/routes directory
import roleRoutes from './routes/roleRoutes';
console.log('ROLE ROUTES TYPE:', typeof roleRoutes);
console.log('STACK:', roleRoutes?.stack?.map((s: any) => s?.route?.path));
