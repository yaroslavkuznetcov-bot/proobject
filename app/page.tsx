const appUrl = "https://app.pro-object.online";

const features = [
  {
    title: "Цифровой журнал работ",
    text: "Ежедневные записи, фотофиксация, участки и история работ в едином интерфейсе."
  },
  {
    title: "Доступ по объектам",
    text: "Заказчик, подрядчик, куратор и администратор видят только те объекты, к которым имеют доступ."
  },
  {
    title: "Карточка объекта",
    text: "Реквизиты участников, адреса и данные объекта хранятся централизованно и готовы для документов."
  },
  {
    title: "Экспорт журнала",
    text: "Выгрузка журнала по объекту в Excel для передачи, проверки и архивирования."
  }
];

const audiences = [
  "строительный контроль",
  "служба заказчика",
  "генподрядчик",
  "подрядные организации",
  "кураторы объектов"
];

export default function LandingPage() {
  return (
    <main className="landingPage">
      <section className="landingHero">
        <nav className="landingNav" aria-label="Главная навигация">
          <div className="landingBrand">ProObject</div>
          <a className="landingLogin" href={appUrl}>Войти в систему</a>
        </nav>

        <div className="landingHeroGrid">
          <div>
            <h1 className="landingTitle">Автоматизированный сбор информации по строительным объектам</h1>
            <p className="landingLead">
              ProObject помогает вести общий журнал работ, собирать фотофиксацию, разграничивать доступ по объектам и готовить основу для исполнительной документации.
            </p>
            <div className="landingActions">
              <a className="landingPrimary" href={appUrl}>Войти в систему</a>
              <a className="landingSecondary" href="#features">Посмотреть возможности</a>
            </div>
          </div>

          <div className="landingPreview" aria-label="Краткое описание ProObject">
            <div className="previewTop">
              <span />
              <span />
              <span />
            </div>
            <div className="previewCard strong">
              <p>Общий журнал работ</p>
              <b>Объект → Участок → Запись → Фото</b>
            </div>
            <div className="previewRows">
              <div><span>Роль</span><b>Администратор</b></div>
              <div><span>Доступ</span><b>Все объекты</b></div>
              <div><span>Экспорт</span><b>Excel</b></div>
            </div>
            <div className="previewCard">
              <p>Уведомления</p>
              <b>Только пользователям объекта</b>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landingSection">
        <div className="sectionHead">
          <p>Возможности</p>
          <h2>От журнала работ к цифровой системе объекта</h2>
        </div>
        <div className="featureGrid">
          {features.map((item) => (
            <article className="featureCard" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landingSection splitSection">
        <div>
          <p className="sectionKicker">Для кого</p>
          <h2>Один инструмент для участников строительного процесса</h2>
          <p className="sectionText">
            Система разделяет права доступа и показывает пользователю только доступные ему объекты, участки, журнал и карточки объектов.
          </p>
        </div>
        <div className="audienceList">
          {audiences.map((item) => <span key={item}>{item}</span>)}
        </div>
      </section>

      <section className="landingCta">
        <h2>Перейти к рабочей системе</h2>
        <p>Авторизация, журнал работ, объекты, пользователи и выгрузка доступны в кабинете ProObject.</p>
        <a className="landingPrimary" href={appUrl}>Войти в систему</a>
      </section>
    </main>
  );
}
