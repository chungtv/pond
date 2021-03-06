function setGlobals() {
  $canv = document.createElement('canvas')
  $canv.width = window.innerWidth
  $canv.height = window.innerHeight
  document.body.appendChild($canv)
  ctx = $canv.getContext('2d')
  ctx.lineJoin = 'round'
  debug = false // true

  // this probably shouldnt be a global...
  usingSmallLogo = false

  // window.ext is set by cocoonjs
  isMobile = !!window.ext
  // color pallet // blue        l blue        l green         orange         d orange
  pallet = [[105,210,231], [167,219,216], [224,228,204], [243,134,48], [250,105,0]]
  lastColor = new Color()
  GAME = {
    MENU: {
      opacity: 1
    },
    state: 'menu',
    firstLoop : true,
    bufferLoop: true
  }
  ASSETS = {loaded: false}

  if(debug){
    stats = new Stats()
    document.body.appendChild(stats.domElement)
  }
  // game loop
  MS_PER_UPDATE = 16
  previousTime = 0.0
  lag = 0.0
  quality = 10
}

setGlobals()
loadAssets(fadeInMenu)

function init() {
  GAME.state = 'playing'
  GAME.player = new Fish(false)
  GAME.fishes = [GAME.player]
  GAME.spawner = new Spawner($canv.width, $canv.height, GAME.player, GAME.fishes)
  GAME.levelParticles = []
  GAME.levelBar = new LevelBar($canv.width)
  GAME.levelBalls = new LevelBalls($canv.width, $canv.height)
  GAME.levelBallParticles = []
  GAME.endGameParticles = []
  GAME.firstLoop = true
  //previousTime = Date.now() - previousTime
  requestAnimFrame(draw)
}

function lowerQuality() {
  if(!isMobile) return
  if(quality >= 7) {
    quality -= 1
    resizeWindow()
  }
}

// main game loop
function draw(time) {
  var i, l, j, dist, nextStage, fish, fish2

  lag += time - previousTime
  previousTime = time
  if(GAME.state === 'playing'){
    requestAnimFrame(draw)
  } else {
    return fadeInMenu()
  }

  var player = GAME.player
  var fishes = GAME.fishes
  var spawner = GAME.spawner
  var levelParticles = GAME.levelParticles
  var levelBar = GAME.levelBar
  var levelBalls = GAME.levelBalls
  var levelBallParticles = GAME.levelBallParticles
  var endGameParticles = GAME.endGameParticles

  if(debug) stats.begin()
  var MAX_CYCLES = 17
  while(lag >= MS_PER_UPDATE && MAX_CYCLES) {
    physics()
    lag -= MS_PER_UPDATE
    MAX_CYCLES--
  }

  if(MAX_CYCLES === 0 && GAME.firstLoop) {
    GAME.firstLoop = false
  } else if( MAX_CYCLES === 0 && GAME.bufferLoop) {
    GAME.bufferLoop = false
  } else if (MAX_CYCLES === 0) {
     // adaptive quality
    lowerQuality()
  }

  // if 5 frames behind, jump
  if(lag/MS_PER_UPDATE > 75) {
    lag = 0.0
  }

  paint()
  if(debug) stats.end()

  function physics() {
    levelBarPhysics()
    levelBallPhysics()
    endGameParticlePhysics()
    // enemy spawner
    spawner.update()
    // enemy spawner debug
    if(debug) spawner.debug()
    fishPhysics()
    playerScore()
  }

  function paint() {
    // clear and draw background
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, $canv.width, $canv.height)

    // static position objects
    levelBar.draw(ctx)
    paintLevelParticles()
    paintLevelBallParticles()
    levelBalls.draw(ctx)

    // dynamic position objects
    ctx.save()
    ctx.translate(-player.x + $canv.width/2, -player.y + $canv.height/2)
    paintEndGameParticles()
    paintFish()
    ctx.restore()

    drawSoundControl()
  }

  function levelBarPhysics() {
    // levelBar level up
    nextStage = levelBar.physics()
    if(nextStage) {
      GAME.levelBallParticles = levelBallParticles.concat(levelBar.toParticles(levelBalls))
      levelBalls.nextColors = levelBar.colors.slice(0, 2)

      // reset levelBar
      GAME.levelBar = new LevelBar($canv.width)
    }

    // levelBar Particles physics
    i = levelParticles.length
    while(i-- > 0) {
      dist = levelParticles[i].physics()
      if (dist < 10) {
        levelParticles.splice(i, 1)
        if(!levelBar.updating) {
          levelBar.updating = true
          levelBar.addColor()
        }
        if(levelParticles.length === 0) {
          levelBar.updating = false
        }
      }
    }
  }

  function levelBallPhysics() {
    // levelBalls level up
    nextStage = levelBalls.physics()
    if(nextStage) {
      GAME.endGameParticles = levelBalls.toParticles(player)

      // un-static position
      for(i=0;i<GAME.endGameParticles.length;i++) {
        GAME.endGameParticles[i].x += player.x - $canv.width/2
        GAME.endGameParticles[i].y += player.y - $canv.height/2
      }

      GAME.levelBalls = new LevelBalls($canv.width, $canv.height)
    }

    i = levelBallParticles.length
    while(i-- > 0) {
      dist = levelBallParticles[i].physics()
      if (dist < 10) {
        levelBallParticles.splice(i, 1)
        if(!levelBalls.updating) {
          levelBalls.updating = true
          levelBalls.addBall()
        }
        if(levelBallParticles.length === 0) {
          levelBalls.updating = false
          levelBalls.shift()
        }
      }
    }
  }

  function endGameParticlePhysics() {
    for(i = -1, l = endGameParticles.length; ++i < l;) {
      endGameParticles[i].physics()
    }
  }

  function fishPhysics() {
    var i,j;
    // physics and drawing
    i = fishes.length
    while(i-- > 0) {
      // cleanup dead fish - in here for performance
      if(fishes[i].dead) {
        if(fishes[i] === player) {
          setTimeout(function(){
            GAME.state = 'menu'
          }, 4000)
        }
        fishes.splice(i, 1)
        continue
      }


      fish = fishes[i]
      if(Math.abs(fish.x - player.x) < $canv.width && Math.abs(fish.y - player.y) < $canv.height) {
        fish.physics()

        // collision - in here for performance
        j=i
        while (j-- > 0) {
          fish2 = fishes[j]
          if(Math.abs(fish2.x - player.x) < $canv.width && Math.abs(fish2.y - player.y) < $canv.height) {
            if(fish.collide(fish2)) {
              if(fish.size >= fish2.size){
                fish2.killedBy(fish)
              } else {
                fish.killedBy(fish2)
              }
            }
          }
        }
      }

      // if far enough away from player, remove
      if(distance(fish, player) > Math.max($canv.width, $canv.height) * 1.2) {
        fish.dead = true
      }

    }
  }

  function playerScore() {

    // player score
    if(player.colors.length > 4 && player.colors.every(function(col){return col.loaded >= 1})) {

      // steal colors from player
      player.drawColors()
      var newParticles = player.toParticles(levelBar)

      // staticly position
      for(i=0;i<newParticles.length;i++) {
        newParticles[i].x += -player.x + $canv.width/2
        newParticles[i].y += -player.y + $canv.height/2
      }

      GAME.levelParticles = levelParticles.concat(newParticles)
      var colors = player.colors.splice(0, 4)

    }
  }

  function paintLevelParticles() {
    for(i = -1, l = levelParticles.length; ++i < l;) {
      levelParticles[i].draw(ctx) // iterate levelParticles
    }
  }

  function paintLevelBallParticles() {
    for(i = -1, l = levelBallParticles.length; ++i < l;) {
      levelBallParticles[i].draw(ctx)
    }
  }

  function paintEndGameParticles() {
    for(i = -1, l = endGameParticles.length; ++i < l;) {
        endGameParticles[i].draw(ctx)
    }
  }

  function paintFish() {
      // draw fish
    var w = $canv.width
    var h = $canv.height
    for(i = -1, l = fishes.length; ++i < l;) {
      fish = fishes[i]
      if(Math.abs(fish.x - player.x) < w/2 + 100 && Math.abs(fish.y - player.y) < h/2 + 100) {
        fish.draw(ctx)
      }
    }
  }

}

function loadAssets(cb) {
  var imgs = [
    { name: 'logo', src: 'assets/logo.png' },
    { name: 'logoSmall', src: 'assets/logo-small.png' },
    { name: 'soundOn', src: 'assets/sound-on.png' },
    { name: 'soundOff', src: 'assets/sound-off.png' },
    {name: 'enter', src: 'assets/enter.png'}
  ]

  function process() {
    var next = imgs.pop()
    if(next) {
      var img = new Image()
      img.onload = function() {
        ASSETS[next.name] = this
        process()
      }
      img.src = next.src
    } else {
      ASSETS.loaded = true
      cb()
    }
  }

  process()
}

// level debug
function levelUp(){
  var levelBar = GAME.levelBar
  for(var i=0;i<9;i++)
    levelBar.addColor()

  levelBar.colors.forEach(function(col){
  col.loaded = 1
  })
  levelBar.x = levelBar.targetX
  levelBar.addColor()
}
function levelUp2(){
  var levelBalls = GAME.levelBalls
  for(var i=0;i<8;i++){
    levelBalls.addBall()
    levelBalls.shift()
  }
  levelBalls.balls.forEach(function(b){b.size = b.targetSize})
  levelBalls.addBall()
}
//setTimeout(levelUp, 3000)
//setTimeout(function(){GAME.levelBar.addColor()}, 10000)
//setTimeout(levelUp2, 3000)
