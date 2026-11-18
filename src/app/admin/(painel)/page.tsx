import estilos from '../admin.module.css';

export default function InicioAdmin() {
  return (
    <section>
      <h1 className={estilos.titulo}>Painel administrativo</h1>
      <p>Escolha uma opção no menu.</p>
    </section>
  );
}