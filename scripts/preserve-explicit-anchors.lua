-- Keep explicit HTML anchors when an auto-generated heading ID matches one.
function Pandoc(doc)
  local explicit = {}
  doc:walk({
    RawInline = function(el)
      if el.format == "html" then
        for id in el.text:gmatch('<a%s+id=["\']([^"\']+)["\']') do
          explicit[id] = true
        end
      end
    end,
    RawBlock = function(el)
      if el.format == "html" then
        for id in el.text:gmatch('<a%s+id=["\']([^"\']+)["\']') do
          explicit[id] = true
        end
      end
    end,
  })

  local used = {}
  doc:walk({
    Header = function(el)
      used[el.identifier] = true
    end,
  })
  return doc:walk({
    Header = function(el)
      if explicit[el.identifier] then
        local base = el.identifier .. "-heading"
        local replacement = base
        local number = 2
        while used[replacement] or explicit[replacement] do
          replacement = base .. "-" .. number
          number = number + 1
        end
        el.identifier = replacement
        used[replacement] = true
        return el
      end
    end,
  })
end
