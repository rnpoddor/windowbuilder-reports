
// формирует структуру с эскизами заполнений
async function glasses({project, view, prod, res}) {
  for(const ox of prod){

    const {_obj: {glasses, coordinates}, name} = ox;
    const ref = $p.utils.snake_ref(ox.ref);
    res[ref] = {
      glasses: glasses,
      imgs: {},
      name,
    };

    if(coordinates && coordinates.length){
      await project.load(ox, true);

      ox.glasses.forEach((row) => {
        const glass = project.draw_fragment({elm: row.elm});
        // подтянем формулу стеклопакета
        res[ref].imgs[`g${row.elm}`] = view.element.toBuffer().toString('base64');
        if(glass){
          row.formula = glass.formula(true);
          glass.visible = false;
        }
      });
    }
  }
}


// формирует json описания продукции с эскизами
async function prod(ctx, next) {

  const {project, view} = new $p.Editor();
  const {nom} = $p.cat;
  const calc_order = await $p.doc.calc_order.get(ctx.params.ref, 'promise');
  const prod = await calc_order.load_production(true);
  const res = {number_doc: calc_order.number_doc};

  const {query} = require('url').parse(ctx.req.url);

  if(query && query.indexOf('glasses') !== -1) {
    await glasses({project, view, prod, res});
  }
  else{
    for(let ox of prod){

      // project.draw_fragment({elm: -1});
      // view.update();
      // ctx.type = 'image/png';
      // ctx.body = return view.element.toBuffer();

      const {_obj} = ox;
      const ref = $p.utils.snake_ref(ox.ref);
      res[ref] = {
        constructions: _obj.constructions || [],
        coordinates: _obj.coordinates || [],
        specification: _obj.specification ? _obj.specification.map((o) => Object.assign(o, {article: nom.get(o.nom).article})) : [],
        glasses: _obj.glasses,
        params: _obj.params,
        clr: _obj.clr,
        sys: _obj.sys,
        x: _obj.x,
        y: _obj.y,
        z: _obj.z,
        s: _obj.s,
        weight: _obj.weight,
        origin: _obj.origin,
        leading_elm: _obj.leading_elm,
        leading_product: _obj.leading_product,
        product: _obj.product,
    };

      if(_obj.coordinates && _obj.coordinates.length){

        await project.load(ox, true)
          .then(() => {
            res[ref].imgs = {
              'l0': view.element.toBuffer().toString('base64')
            };

        ox.constructions.forEach(({cnstr}) => {
          project.draw_fragment({elm: -cnstr});
          res[ref].imgs[`l${cnstr}`] = view.element.toBuffer().toString('base64');
        });

        ox.glasses.forEach((row) => {
          const glass = project.draw_fragment({elm: row.elm});
          // подтянем формулу стеклопакета
          res[ref].imgs[`g${row.elm}`] = view.element.toBuffer().toString('base64');
          if(glass){
            row.formula = glass.formula(true);
            glass.visible = false;
          }
        });
        });
      }
    }
  }

  ctx.body = res;

  setTimeout(() => {
    try{
      calc_order.unload();
      project.unload();
      for(const ox of prod){
        ox.unload();
      };
      prod.length = 0;
    }
    catch(err){}
  });

}

// формирует массив эскизов по параметрам запроса
async function array(ctx, next) {

// отсортировать по заказам и изделиям
  const prms = JSON.parse(ctx.params.ref);
  const grouped = $p.wsql.alasql('SELECT calc_order, product, elm FROM ? GROUP BY ROLLUP(calc_order, product, elm)', [prms]);
  const res = [];
  const {project, view} = new $p.Editor();

  function builder_props({calc_order, product}) {
    for(const prm of prms) {
      if(calc_order === prm.calc_order && product === prm.product) {
        return prm.builder_props || true;
      }
    }
    return true;
  }

  let calc_order, ox, fragmented;
  for(let img of grouped) {
    if(img.product == null){
      if(calc_order){
        calc_order.unload();
        calc_order = null;
      }
      if(img.calc_order){
        calc_order = await $p.doc.calc_order.get(img.calc_order, 'promise');
      }
      continue;
    }
    if(img.elm == null){
      if(ox){
        ox.unload();
        ox = null;
      }
      const row = calc_order.production.get(img.product-1);
      if(row){
        ox = await calc_order.production.get(img.product-1).characteristic.load();
        await project.load(ox, builder_props(img));
        fragmented = false;
      }
      else{
        ox = null;
      }
      continue;
    }

    if(!ox){
      continue;
    }

    if(img.elm == 0){
      if(fragmented){
        await project.load(ox, builder_props(img));
      }
    }
    else{
      fragmented = true;
      project.draw_fragment({elm: img.elm});
    }

    res.push({
      calc_order: img.calc_order,
      product: img.product,
      elm: img.elm,
      img: view.element.toBuffer().toString('base64')
    })
  }

  calc_order && calc_order.unload();
  ox && ox.unload();

  ctx.body = res;

}

// формирует единичный эскиз по параметрам запроса
async function png(ctx, next) {

}

// формирует единичный эскиз по параметрам запроса
async function svg(ctx, next) {

}

export default async (ctx, next) => {

  // если указано ограничение по ip - проверяем
  const {restrict_ips} = ctx.app;
  const ip = ctx.req.headers['x-real-ip'] || ctx.ip;
  if(restrict_ips.length && restrict_ips.indexOf(ip) == -1){
    ctx.status = 403;
    ctx.body = 'ip restricted: ' + ip;
    return;
  }

  // проверяем авторизацию
  // let {authorization, suffix} = ctx.req.headers;
  // if(!authorization || !suffix){
  //   ctx.status = 403;
  //   ctx.body = 'access denied';
  //   return;
  // }

  console.log(ctx.params);

  try{
    switch (ctx.params.class){
      case 'doc.calc_order':
        return await prod(ctx, next);
      case 'array':
        return await array(ctx, next);
      case 'png':
        return await png(ctx, next);
      case 'svg':
        return await svg(ctx, next);
    }
  }
  catch(err){
    ctx.status = 500;
    ctx.body = err.stack;
    console.log(err);
  }

};
