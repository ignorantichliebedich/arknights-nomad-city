export function FrontierPostcard({ oripathy }: { oripathy: boolean }) {
  return (
    <figure className="frontier-postcard">
      <div className="postcard-mount">
        <img
          src="/assets/nomad-table-backdrop.webp"
          alt="官方铸基者宣传画：企业家们在夕阳下的拓荒区集结"
          draggable={false}
        />
        <figcaption>
          <span>哥伦比亚 · 第 105 号拓荒区</span>
          <b>1099</b>
        </figcaption>
      </div>
      <span className="postcard-tape" aria-hidden="true" />
      <div className="postcard-stamp" aria-hidden="true">
        <span>FRONTIER</span>
        <b>拓荒启程</b>
        <span>APPROVED · 105</span>
      </div>
      <p className="postcard-note">
        {oripathy ? "荒野之外，还有新的抉择。" : "把第一枚标记，留在未知之地。"}
      </p>
    </figure>
  );
}
